import type { Metadata, Viewport } from "next";
import NextTopLoader from 'nextjs-toploader';
import "./globals.css";
import '@/lib/config/validate-env';

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "GatePass Portal — Campus Movement Management",
  description:
    "Centralized campus permission and movement tracking system with role-based dashboards for Admin, Student, Faculty, Warden, and Security.",
  keywords: ["campus", "gate pass", "student management", "permission system"],
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body className="font-sans min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <NextTopLoader color="#f97316" showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
