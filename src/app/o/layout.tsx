import type { Metadata } from "next";
import { VisitPhoneLayout } from "@/components/visit-phone/phone-layout";

export const metadata: Metadata = {
  title: "Office visit — Ramachandra College of Engineering",
};

/** An office's QR poster, scanned with the visitor's phone (public, no login) */
export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return <VisitPhoneLayout>{children}</VisitPhoneLayout>;
}
