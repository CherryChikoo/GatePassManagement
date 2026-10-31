import type { Metadata } from "next";
import { VisitPhoneLayout } from "@/components/visit-phone/phone-layout";

export const metadata: Metadata = {
  title: "Visitor check-in — Ramachandra College of Engineering",
};

/** The visitor's own phone: check-in form and their visit (public, no login) */
export default function VisitLayout({ children }: { children: React.ReactNode }) {
  return <VisitPhoneLayout>{children}</VisitPhoneLayout>;
}
