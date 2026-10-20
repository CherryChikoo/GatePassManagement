import type { Metadata, Viewport } from "next";
import { Noto_Sans_Telugu, Poppins } from "next/font/google";
import NextTopLoader from 'nextjs-toploader';
import "./globals.css";
import '@/lib/config/validate-env';
import { VersionWatcher } from "@/components/providers/version-watcher";

// Self-hosted by Next.js: no request to Google at runtime, no layout shift
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

// Telugu letters for the Security screens (Poppins has none). Not preloaded: the
// browser only fetches it when Telugu text is on screen, so other pages pay nothing.
const telugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--font-telugu",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f4f4f6",
};

export const metadata: Metadata = {
  title: "Gate Pass — Ramachandra College of Engineering",
  description:
    "Campus gate pass and movement management for students, faculty, wardens and security.",
  keywords: ["campus", "gate pass", "student management", "permission system"],
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} ${telugu.variable}`} data-scroll-behavior="smooth">
      <body className="font-sans min-h-[100dvh] bg-zinc-950 text-zinc-100 antialiased">
        <NextTopLoader color="#ff634a" showSpinner={false} />
        <VersionWatcher />
        {children}
      </body>
    </html>
  );
}
