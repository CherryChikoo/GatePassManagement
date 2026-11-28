"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { lastSecurityTab } from "@/lib/security-tab";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/** Big, thumb-friendly "Go Back" (Security pages): returns to the bottom tab the guard came from. */
export function GoBackButton({ href, className }: { href?: string; className?: string }) {
  const t = useT();
  // No address given: the last bottom tab (Registers / Daily labours / Passes / Siros), read after load
  const [tab, setTab] = useState("/security");
  useEffect(() => {
    if (!href) setTab(lastSecurityTab());
  }, [href]);
  const to = href ?? tab;
  const security = (usePathname() ?? "").startsWith("/security");
  if (!security) {
    // Other logins: a slim white pill with the coral arrow tile
    return (
      <Link
        href={to}
        className={cn(
          "group inline-flex h-11 items-center gap-2.5 rounded-full border border-orange-500/15 bg-white pl-1.5 pr-5 text-sm font-semibold text-zinc-100 shadow-[0_8px_20px_-16px_rgba(207,62,37,0.55)] transition-[border-color,box-shadow,transform] hover:border-orange-500/35 hover:shadow-[0_10px_24px_-14px_rgba(207,62,37,0.55)] active:scale-[0.98]",
          className
        )}
      >
        <span className="icon-tile flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:-translate-x-0.5">
          <ArrowLeft className="h-4 w-4" />
        </span>
        {t("Go Back")}
      </Link>
    );
  }
  return (
    <Link
      href={to}
      className={cn(
        "group inline-flex h-14 items-center gap-3 rounded-full border-2 border-zinc-700 bg-zinc-900 pl-2 pr-6 text-lg font-bold text-zinc-100 shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-[0.98]",
        className
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-600 text-white transition-transform group-hover:-translate-x-0.5">
        <ArrowLeft className="h-5 w-5" />
      </span>
      {t("Go Back")}
    </Link>
  );
}
