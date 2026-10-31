"use client";

import Image from "next/image";
import { LanguageToggle, useT } from "@/components/providers/language-provider";

/**
 * Frame of every page on the visitor's own phone (no login): the college logo,
 * the English / Telugu switch, and one narrow column with large touch targets.
 */
export function PhoneShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-md px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <header className="mb-5 space-y-3">
          <div className="flex justify-end">
            <LanguageToggle />
          </div>
          <Image
            src="/brand/logo-full.webp"
            alt="Ramachandra College of Engineering (Autonomous)"
            width={900}
            height={192}
            priority
            sizes="(max-width: 640px) 80vw, 320px"
            className="mx-auto h-auto w-full max-w-[280px]"
          />
          <p className="text-center text-xs font-medium uppercase tracking-wider text-zinc-500">{t("Visitor check-in")}</p>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
