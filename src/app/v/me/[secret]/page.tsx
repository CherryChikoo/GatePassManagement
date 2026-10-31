import { VisitStatusView } from "@/components/visit-phone/visit-status";

export const dynamic = "force-dynamic";

/** The visitor's own visit: waiting, inside (how to leave, Exit QR), turned away or left. */
export default async function MyVisitPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  return <VisitStatusView secret={secret.slice(0, 100)} />;
}
