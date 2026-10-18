/**
 * Privileged Supabase Storage helpers (service-role key).
 *
 * This is deliberately NOT a "use server" module: nothing here can be invoked
 * from the browser. Only server actions / route handlers that have already
 * performed their own authorization may import it.
 */

import { createClient } from "@supabase/supabase-js";

export const BUCKET_NAME = "exit-photos";
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BASE64_LENGTH = 700_000; // ~500 KB binary

function adminStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage;
}

/** Storage object paths we generate: "<folder>/<safe segments>". */
export function isSafeStoragePath(path: string): boolean {
  return /^(students|outsiders|registers)\/[A-Za-z0-9_\-./]+$/.test(path) && !path.includes("..");
}

function decodeImage(base64Data: string): { mimeType: string; buffer: Buffer } | { error: string } {
  if (base64Data.length > MAX_BASE64_LENGTH) {
    return { error: "Image too large. Please retake with lower resolution." };
  }
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) return { error: "Invalid image format" };
  const mimeType = matches[1].toLowerCase() === "image/jpg" ? "image/jpeg" : matches[1].toLowerCase();
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mimeType)) {
    return { error: "Only JPEG, PNG or WebP images are allowed" };
  }
  return { mimeType, buffer: Buffer.from(matches[2], "base64") };
}

async function uploadImage(base64Data: string, folderPath: string, fileStem: string) {
  const decoded = decodeImage(base64Data);
  if ("error" in decoded) return { path: null, error: decoded.error };

  const extension = decoded.mimeType.split("/")[1];
  const filePath = `${folderPath}/${fileStem}_${Date.now()}.${extension}`;

  // A brief Storage or network hiccup shouldn't hold up the gate: up to 3 tries
  // (0.4 s, then 1.2 s apart). Same path every try, so a retry can never make a
  // second copy (upsert: false → "already exists" means the first try landed).
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 400 : 1200));
    const { data, error } = await adminStorage().from(BUCKET_NAME).upload(filePath, decoded.buffer, {
      contentType: decoded.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
    if (!error) return { path: data.path, error: null };
    if (/already exists|duplicate/i.test(error.message)) return { path: filePath, error: null };
    lastError = error.message;
  }
  console.error("[storage] upload failed after 3 tries:", lastError);
  return { path: null, error: "Photo upload failed" };
}

const safeSegment = (s: string) => s.replace(/[^a-z0-9_-]/gi, "_").slice(0, 60) || "x";

export function uploadExitPhotoAdmin(base64Data: string, ownerId: string, permissionId: string) {
  return uploadImage(base64Data, gatePhotoFolder(ownerId), safeSegment(permissionId));
}

/** Storage folder holding one person’s gate photos. */
export function gatePhotoFolder(ownerId: string): string {
  return `students/${safeSegment(ownerId)}`;
}

/** Photo taken with a register entry (registers with "Take a photo" switched on). */
export function uploadRegisterPhotoAdmin(base64Data: string, registerKey: string) {
  return uploadImage(base64Data, `registers/${safeSegment(registerKey.toLowerCase())}`, "entry");
}

export function uploadOutsiderPhotoAdmin(base64Data: string, outsiderName: string) {
  return uploadImage(base64Data, "outsiders", safeSegment(outsiderName.toLowerCase()));
}

export async function createSignedPhotoUrl(storagePath: string): Promise<string | null> {
  if (!isSafeStoragePath(storagePath)) return null;
  const { data, error } = await adminStorage().from(BUCKET_NAME).createSignedUrl(storagePath, 3600);
  if (error) {
    console.error("[storage] signed URL error:", error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Deletes visitor photos older than `daysOld` (outsiders/<file>). Student gate
 * photos (students/<ownerId>/<file>) are permanent and never deleted.
 */
export async function deleteOldPhotos(daysOld: number = 90): Promise<{ deleted: number; error: string | null }> {
  const storage = adminStorage().from(BUCKET_NAME);
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];

  async function walk(prefix: string, depth: number) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return;
      for (const entry of data) {
        const fullPath = `${prefix}/${entry.name}`;
        // Folders have no id/metadata in Supabase listings
        if (!entry.id) {
          if (depth < 3) await walk(fullPath, depth + 1);
        } else if (entry.created_at && new Date(entry.created_at).getTime() < cutoff) {
          toDelete.push(fullPath);
        }
      }
      if (data.length < 1000) return;
    }
  }

  try {
    // Student gate photos (exit / entry, under "students/") are permanent and
    // never cleaned up. Only visitor photos expire.
    await walk("outsiders", 0);
    for (let i = 0; i < toDelete.length; i += 100) {
      const { error } = await storage.remove(toDelete.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
    return { deleted: toDelete.length, error: null };
  } catch (err: any) {
    console.error("[storage] cleanup error:", err?.message);
    return { deleted: 0, error: err?.message || "Cleanup failed" };
  }
}

// ─── Profile photos ─────────────────────────────────────────────────────────
// One small JPEG per person at avatars/<profileId>.jpg, overwritten on change,
// so storage never grows with re-uploads (free-tier friendly).

/** Profile photos are tiny (256×256 JPEG from the browser): reject anything big. */
const MAX_AVATAR_BASE64 = 200_000;

const avatarPath = (profileId: string) => `avatars/${safeSegment(profileId)}.jpg`;

export async function uploadAvatarAdmin(base64Data: string, profileId: string): Promise<{ error: string | null }> {
  if (typeof base64Data !== "string" || base64Data.length > MAX_AVATAR_BASE64) {
    return { error: "Photo too large. Please choose another picture." };
  }
  const decoded = decodeImage(base64Data);
  if ("error" in decoded) return { error: decoded.error };
  if (decoded.mimeType !== "image/jpeg") return { error: "Invalid photo" };
  const { error } = await adminStorage().from(BUCKET_NAME).upload(avatarPath(profileId), decoded.buffer, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) {
    console.error("[storage] avatar upload failed:", error.message);
    return { error: "Could not save the photo. Please try again." };
  }
  return { error: null };
}

export async function deleteAvatarAdmin(profileId: string): Promise<void> {
  await adminStorage().from(BUCKET_NAME).remove([avatarPath(profileId)]);
}

/** The photo bytes, or null if there is none. */
export async function downloadAvatarAdmin(profileId: string): Promise<ArrayBuffer | null> {
  const { data, error } = await adminStorage().from(BUCKET_NAME).download(avatarPath(profileId));
  if (error || !data) return null;
  return data.arrayBuffer();
}
