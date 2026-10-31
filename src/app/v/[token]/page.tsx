import { CheckInForm } from "@/components/visit-phone/check-in-form";

export const dynamic = "force-dynamic";

/** Opened by scanning Security's check-in QR: the visitor fills the register's form on their phone. */
export default async function VisitCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CheckInForm token={token.slice(0, 200)} />;
}
