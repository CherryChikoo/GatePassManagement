"use server";

/**
 * Reads a bill photo (stock registers) with the free Gemini models and returns
 * the details it can see: bill number, amount, items, size / quantity, vehicle
 * number, supplier. The form fills only empty boxes and marks them "Check".
 *
 * Free plan: one Gemini request per bill photo (an image is a few hundred
 * tokens); a guard can read at most 40 bills an hour (kept in memory) so the
 * free daily limit is never used up by one phone.
 */
import { requireRole } from "@/lib/auth/helpers";
import { downloadRegisterPhotoAdmin, isSafeStoragePath } from "@/lib/storage/storage-admin";
import { fillWithGemini, VoiceServiceError } from "@/lib/voice/providers";

const PHOTO_RE = /^registers\/[A-Za-z0-9_\-./]+$/;
const MAX_BYTES = 3 * 1024 * 1024;
const PER_HOUR = 40;
const reads = new Map<string, number[]>();

export type BillDetails = {
  billNumber?: string;
  billAmount?: number;
  itemName?: string;
  quantity?: string;
  vehicleNumber?: string;
  supplierName?: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    billNumber: { type: "string", description: "Bill / invoice number exactly as printed, empty if none" },
    totalAmount: { type: "number", description: "Grand total amount in rupees (the final payable total), 0 if not visible" },
    items: { type: "string", description: "Short list of the items / materials, e.g. 'Cement, River sand'" },
    quantity: { type: "string", description: "Quantities / sizes with units, e.g. '50 bags, 2 tonnes'" },
    vehicleNumber: { type: "string", description: "Vehicle / lorry number if written on the bill, else empty" },
    supplier: { type: "string", description: "Seller / supplier / shop name at the top of the bill, else empty" },
  },
  required: ["billNumber", "totalAmount", "items", "quantity", "vehicleNumber", "supplier"],
};

export async function readBillPhoto(photoPath: string): Promise<{ success: true; details: BillDetails } | { error: string }> {
  const user = await requireRole("SECURITY", "ADMIN");
  if (typeof photoPath !== "string" || !PHOTO_RE.test(photoPath) || photoPath.includes("..") || !isSafeStoragePath(photoPath)) {
    return { error: "Take the bill photo again" };
  }
  // A few reads an hour per guard is plenty; this keeps the free Gemini limit safe
  const now = Date.now();
  const recent = (reads.get(user.profileId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_HOUR) return { error: "Too many bills read this hour. Type the details." };
  reads.set(user.profileId, [...recent, now]);
  if (reads.size > 1000) reads.clear();

  const photo = await downloadRegisterPhotoAdmin(photoPath);
  if (!photo || photo.bytes.byteLength > MAX_BYTES) return { error: "Could not open the bill photo" };

  try {
    const out = (await fillWithGemini({
      system:
        "You read Indian shop bills / invoices / delivery challans photographed at a college gate. " +
        "Return only what is clearly printed or written on the bill. Never guess. Use empty strings (or 0) for anything not visible.",
      user: "Read this bill and fill the fields.",
      schema: SCHEMA,
      image: { mimeType: photo.type, data: Buffer.from(photo.bytes).toString("base64") },
    })) as Record<string, unknown> | null;
    const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
    const amount = typeof out?.totalAmount === "number" && out.totalAmount > 0 && out.totalAmount < 1e8 ? Math.round(out.totalAmount * 100) / 100 : 0;
    const details: BillDetails = {};
    if (text(out?.billNumber, 60)) details.billNumber = text(out?.billNumber, 60);
    if (amount) details.billAmount = amount;
    if (text(out?.items)) details.itemName = text(out?.items);
    if (text(out?.quantity)) details.quantity = text(out?.quantity);
    if (text(out?.vehicleNumber, 20)) details.vehicleNumber = text(out?.vehicleNumber, 20).toUpperCase();
    if (text(out?.supplier, 100)) details.supplierName = text(out?.supplier, 100);
    if (Object.keys(details).length === 0) return { error: "Could not read the bill. Type the details." };
    return { success: true, details };
  } catch (err) {
    if (err instanceof VoiceServiceError && err.kind === "busy") return { error: "The bill reader is busy. Type the details, or try again." };
    if (err instanceof VoiceServiceError && err.kind === "setup") return { error: "The bill reader is not set up." };
    return { error: "Could not read the bill. Type the details." };
  }
}
