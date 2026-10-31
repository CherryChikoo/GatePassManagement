import { OfficeVisit } from "@/components/visit-phone/office-visit";

export const dynamic = "force-dynamic";

/** Opened by scanning an office's QR poster: records the visit and opens the visitor's Exit QR. */
export default async function OfficePosterPage({ params }: { params: Promise<{ posterKey: string }> }) {
  const { posterKey } = await params;
  return <OfficeVisit posterKey={posterKey.slice(0, 100)} />;
}
