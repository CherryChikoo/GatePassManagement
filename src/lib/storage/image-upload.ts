"use server";

/**
 * Supabase Storage Helper for Exit Photos
 * Optimized for free tier: compressed images, auto-cleanup
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_NAME = "exit-photos";

/**
 * Initialize storage bucket (run once on setup)
 */
export async function initializeBucket() {
  try {
    // Create bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === BUCKET_NAME);

    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: false, // Private - only authenticated users
        fileSizeLimit: 500_000, // 500 KB max per image
        allowedMimeTypes: ["image/jpeg", "image/jpg", "image/png"],
      });
    }

    // Set retention policy: delete files older than 90 days
    // Note: This requires manual setup in Supabase dashboard
    // Dashboard → Storage → exit-photos → Settings → Object Lifecycle
    
    return { success: true };
  } catch (error: any) {
    console.error("Failed to initialize bucket:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload image to Supabase Storage (replaces base64 in database)
 */
export async function uploadExitPhoto(
  base64Data: string,
  studentId: string,
  permissionId: string
): Promise<{ path: string | null; error: string | null }> {
  try {
    // Validate base64 size (should be < 500KB after compression)
    if (base64Data.length > 700_000) {
      // ~500KB base64 encoded
      return { path: null, error: "Image too large. Please compress to < 500 KB." };
    }

    // Extract mime type and data
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return { path: null, error: "Invalid base64 format" };
    }

    const mimeType = matches[1];
    const base64Content = matches[2];
    const buffer = Buffer.from(base64Content, "base64");

    // Generate unique file path: students/{studentId}/{permissionId}_{timestamp}.jpg
    const timestamp = Date.now();
    const extension = mimeType.split("/")[1] || "jpg";
    const filePath = `students/${studentId}/${permissionId}_${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: mimeType,
        cacheControl: "3600", // Cache for 1 hour
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      return { path: null, error: error.message };
    }

    // Return storage path (to save in database)
    return { path: data.path, error: null };
  } catch (err: any) {
    console.error("Upload exception:", err);
    return { path: null, error: err.message || "Upload failed" };
  }
}

/**
 * Upload outsider photo to Supabase Storage
 */
export async function uploadOutsiderPhoto(
  base64Data: string,
  outsiderName: string
): Promise<{ path: string | null; error: string | null }> {
  try {
    if (base64Data.length > 700_000) {
      return { path: null, error: "Image too large. Please compress to < 500 KB." };
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return { path: null, error: "Invalid base64 format" };
    }

    const mimeType = matches[1];
    const base64Content = matches[2];
    const buffer = Buffer.from(base64Content, "base64");

    const timestamp = Date.now();
    const extension = mimeType.split("/")[1] || "jpg";
    const sanitizedName = outsiderName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filePath = `outsiders/${sanitizedName}_${timestamp}.${extension}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      return { path: null, error: error.message };
    }

    return { path: data.path, error: null };
  } catch (err: any) {
    console.error("Upload exception:", err);
    return { path: null, error: err.message || "Upload failed" };
  }
}

/**
 * Get signed URL for viewing image (expires in 1 hour)
 */
export async function getExitPhotoUrl(
  storagePath: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) {
      console.error("Failed to get signed URL:", error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error("Exception getting URL:", err);
    return null;
  }
}

/**
 * Delete old exit photos (for cleanup cron job)
 */
export async function deleteOldPhotos(daysOld: number = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // List all files in bucket
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list("students", {
        limit: 1000,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (listError) {
      console.error("Failed to list files:", listError);
      return { deleted: 0, error: listError.message };
    }

    // Filter files older than cutoff
    const oldFiles = files?.filter((file) => {
      if (!file.created_at) return false;
      const fileDate = new Date(file.created_at);
      return fileDate < cutoffDate;
    });

    if (!oldFiles || oldFiles.length === 0) {
      return { deleted: 0, error: null };
    }

    // Delete old files
    const filePaths = oldFiles.map((f) => `students/${f.name}`);
    const { data, error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(filePaths);

    if (deleteError) {
      console.error("Failed to delete files:", deleteError);
      return { deleted: 0, error: deleteError.message };
    }

    return { deleted: filePaths.length, error: null };
  } catch (err: any) {
    console.error("Cleanup exception:", err);
    return { deleted: 0, error: err.message };
  }
}
