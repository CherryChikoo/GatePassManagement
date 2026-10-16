import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function FacultyPassHistoryLoading() {
  const block = "bg-zinc-800/60";
  return (
    <div className="mx-auto max-w-6xl w-full space-y-6 animate-pulse">
      {/* Back button skeleton */}
      <div className={`${block} h-9 w-44 rounded-full`} />

      {/* Profile header skeleton */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className={`${block} h-14 w-14 sm:h-16 sm:w-16 rounded-2xl shrink-0`} />
              <div className="space-y-2 min-w-0">
                <div className={`${block} h-7 w-48 max-w-full rounded-full`} />
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`${block} h-5 w-20 rounded-full`} />
                  <div className={`${block} h-5 w-24 rounded-full`} />
                  <div className={`${block} h-5 w-16 rounded-full`} />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className={`${block} h-4 w-32 rounded-full`} />
                  <div className={`${block} h-4 w-40 rounded-full`} />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className={`${block} h-7 w-32 rounded-full`} />
              <div className={`${block} h-9 w-36 rounded-full`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-3xl border border-zinc-800/80 bg-zinc-900 p-4 sm:p-5 md:p-6 shadow-card space-y-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`${block} h-4 w-24 rounded-full`} />
              <div className={`${block} h-9 w-9 rounded-full`} />
            </div>
            <div className="space-y-2">
              <div className={`${block} h-9 w-14 rounded-xl`} />
              <div className={`${block} h-3 w-28 rounded-full`} />
            </div>
          </div>
        ))}
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="h-10 w-full sm:w-96 rounded-full border border-zinc-800 bg-zinc-950" />
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="h-10 w-full sm:w-40 rounded-full border border-zinc-800 bg-zinc-900" />
          <div className="h-10 w-full sm:w-72 rounded-full border border-zinc-800 bg-zinc-900" />
        </div>
      </div>

      {/* Pass cards skeleton */}
      <div className="grid gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <div className={`${block} h-5 w-20 rounded-full`} />
                <div className={`${block} h-5 w-48 max-w-full rounded-full`} />
                <div className={`${block} h-5 w-20 rounded-full`} />
              </div>
              <div className={`${block} h-4 w-36 rounded-full`} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="h-16 rounded-2xl bg-zinc-950" />
              <div className="h-16 rounded-2xl bg-zinc-950" />
              <div className="h-16 rounded-2xl bg-zinc-950" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
