import type { Metadata } from "next";
import { VisitPhoneLayout } from "@/components/visit-phone/phone-layout";

export const metadata: Metadata = {
  title: "Visitor check-in — Ramachandra College of Engineering",
};

/** The visitor's own phone: the check-in form and its "details sent" confirmation (public, no login) */
export default function VisitLayout({ children }: { children: React.ReactNode }) {
  return <VisitPhoneLayout>{children}</VisitPhoneLayout>;
}
