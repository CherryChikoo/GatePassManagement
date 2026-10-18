"use server";

/**
 * Browser-callable photo actions. Every export is a public server action,
 * so each one authorizes the caller before touching storage.
 */

import { requireRole } from "@/lib/auth/helpers";
import { createSignedPhotoUrl, uploadOutsiderPhotoAdmin, uploadRegisterPhotoAdmin } from "@/lib/storage/storage-admin";

/**
 * Upload an outsider/visitor photo (security desk only).
 */
export async function uploadOutsiderPhoto(
  base64Data: string,
  outsiderName: string
): Promise<{ path: string | null; error: string | null }> {
  await requireRole("SECURITY", "ADMIN");
  if (typeof base64Data !== "string" || typeof outsiderName !== "string") {
    return { path: null, error: "Invalid input" };
  }
  return uploadOutsiderPhotoAdmin(base64Data, outsiderName);
}

/**
 * Get a short-lived signed URL for viewing a stored exit/visitor photo.
 * Legacy rows may still hold an inline data URI, which is returned as-is.
 */
export async function getExitPhotoUrl(storagePath: string): Promise<string | null> {
  await requireRole("SECURITY", "ADMIN");
  if (!storagePath || typeof storagePath !== "string") return null;
  if (storagePath.startsWith("data:image/")) return storagePath;
  return createSignedPhotoUrl(storagePath);
}

/** Security / Admin: upload the photo taken with a register entry. */
export async function uploadRegisterPhoto(
  base64Data: string,
  registerKey: string
): Promise<{ path: string | null; error: string | null }> {
  await requireRole("SECURITY", "ADMIN");
  if (typeof base64Data !== "string" || typeof registerKey !== "string" || !/^[A-Z0-9_]{2,40}$/.test(registerKey)) {
    return { path: null, error: "Invalid input" };
  }
  return uploadRegisterPhotoAdmin(base64Data, registerKey);
}

/** Everyone who can see the registers may view their photos (signed, short-lived link). */
export async function getRegisterPhotoUrl(storagePath: string): Promise<string | null> {
  await requireRole("SECURITY", "ADMIN", "SECURITY_SUPERVISOR");
  if (typeof storagePath !== "string" || !storagePath.startsWith("registers/")) return null;
  return createSignedPhotoUrl(storagePath);
}
