"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/** Big, thumb-friendly "Go Back" (Security pages): returns to the registers home. */
export function GoBackButton({ href = "/security", className }: { href?: string; className?: string }) {
  const t = useT();
  return (
    <Link
      href={href}
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
