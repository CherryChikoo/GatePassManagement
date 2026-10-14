"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Eye } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { REGISTERS, REGISTER_BY_KEY, isEntryRegister, registerSlug, type RegisterKey } from "@/lib/registers/definitions";
import { getRegisterCountsToday } from "@/server/actions/registers";
import { EntryRegisterView } from "./entry-register-view";
import { FacultyBookView, HomeOutingSummaryView, HostelOutingView, VisitorsBookView } from "./derived-views";

export type RegisterViewer = "SECURITY" | "ADMIN" | "SECURITY_SUPERVISOR";

const BASE: Record<RegisterViewer, string> = {
  SECURITY: "/security",
  ADMIN: "/admin",
  SECURITY_SUPERVISOR: "/supervisor",
};

export function RegistersHub({ viewer }: { viewer: RegisterViewer }) {
  const base = BASE[viewer];
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    getRegisterCountsToday().then(setCounts).catch(() => setCounts({}));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <BackButton href={base} label="Back to Dashboard" />
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-orange-500" /> Security Registers
          {viewer !== "SECURITY" && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-zinc-800 text-zinc-300 border-zinc-700">
              <Eye className="h-3 w-3" /> View only
            </span>
          )}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          All gate registers. Saved records are permanent and cannot be edited.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {REGISTERS.map((r) => (
          <Link
            key={r.key}
            href={`${base}/registers/${registerSlug(r.key)}`}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-orange-500/40 transition-colors flex items-start gap-3"
          >
            <span className="shrink-0 h-8 w-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-zinc-100">{r.title}</span>
              <span className="block text-xs text-zinc-500 mt-0.5">{r.description}</span>
              {isEntryRegister(r) && (counts[r.key] ?? 0) > 0 && (
                <span className="inline-block mt-1.5 text-[11px] rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                  {counts[r.key]} today
                </span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-orange-400 shrink-0 mt-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function RegisterPage({ registerKey, viewer }: { registerKey: RegisterKey; viewer: RegisterViewer }) {
  const def = REGISTER_BY_KEY[registerKey];
  const base = BASE[viewer];
  const isSecurity = viewer === "SECURITY";

  let body: React.ReactNode;
  if (isEntryRegister(def)) {
    body = <EntryRegisterView def={def} canCreate={isSecurity} />;
  } else if (def.key === "FACULTY_BOOK") {
    body = <FacultyBookView canMarkIn={isSecurity} />;
  } else if (def.key === "VISITORS") {
    body = <VisitorsBookView canRegister={isSecurity} />;
  } else if (def.key === "BOYS_HOSTEL_OUTING") {
    body = <HostelOutingView hostel="BOYS" />;
  } else if (def.key === "LADIES_HOSTEL_OUTING") {
    body = <HostelOutingView hostel="LADIES" />;
  } else {
    body = <HomeOutingSummaryView />;
  }

  return (
    <div className="space-y-5">
      <div>
        <BackButton href={`${base}/registers`} label="All registers" />
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
          {def.title}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{def.description}</p>
      </div>
      {body}
    </div>
  );
}
