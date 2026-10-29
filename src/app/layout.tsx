import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import NextTopLoader from 'nextjs-toploader';
import "./globals.css";
import '@/lib/config/validate-env';
import { VersionWatcher } from "@/components/providers/version-watcher";

// Font files are kept in the app (src/app/fonts), so the build never depends on
// downloading them from Google — a failed download there once broke a deployment.
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-poppins",
});

// Telugu letters for the Security screens (Poppins has none). Not preloaded, and
// limited to Telugu letters: the browser only fetches it when Telugu text is on
// screen, so other pages pay nothing.
const telugu = localFont({
  src: "./fonts/noto-sans-telugu.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  variable: "--font-telugu",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0951-0952, U+0964-0965, U+0B83, U+0C00-0C7F, U+1CD5-1CD6, U+1CD8, U+1CDA, U+1CF2, U+200C-200D, U+25CC",
    },
  ],
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
