import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function FacultyPassHistoryLoading() {
  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto animate-pulse">
      {/* Back button skeleton */}
      <div className="h-9 w-44 rounded-lg bg-zinc-800/80" />

      {/* Profile Header Card Skeleton */}
      <Card className="border border-zinc-800 bg-zinc-900/70 shadow-none overflow-hidden rounded-2xl">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl bg-zinc-800 shrink-0" />
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-6 w-48 rounded-md bg-zinc-800" />
                  <div className="h-5 w-20 rounded-md bg-zinc-800" />
                  <div className="h-5 w-24 rounded-full bg-zinc-800" />
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <div className="h-4 w-32 rounded bg-zinc-800" />
                  <div className="h-4 w-40 rounded bg-zinc-800" />
                  <div className="h-4 w-28 rounded bg-zinc-800" />
                </div>
              </div>
            </div>
            <div className="h-7 w-32 rounded-lg bg-zinc-800" />
          </div>
        </CardContent>
      </Card>

      {/* Summary Stat Cards Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-2"
          >
            <div className="h-3.5 w-24 rounded bg-zinc-800" />
            <div className="h-7 w-12 rounded bg-zinc-800" />
            <div className="h-3 w-32 rounded bg-zinc-800/60" />
          </div>
        ))}
      </div>

      {/* Filter Tabs & Search Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="h-10 w-full sm:w-96 rounded-xl bg-zinc-900/80 border border-zinc-800" />
        <div className="h-9 w-full sm:w-72 rounded-lg bg-zinc-900 border border-zinc-800" />
      </div>

      {/* Pass Cards Skeleton */}
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <Card
            key={i}
            className="border border-zinc-800 bg-zinc-900/50 rounded-2xl overflow-hidden shadow-none p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
              <div className="flex items-center gap-3">
                <div className="h-5 w-20 rounded-md bg-zinc-800" />
                <div className="h-5 w-56 rounded bg-zinc-800" />
                <div className="h-5 w-24 rounded-full bg-zinc-800" />
              </div>
              <div className="h-4 w-36 rounded bg-zinc-800/70" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="h-16 rounded-xl bg-zinc-950/60 border border-zinc-800/60" />
              <div className="h-16 rounded-xl bg-zinc-950/60 border border-zinc-800/60" />
              <div className="h-16 rounded-xl bg-zinc-950/60 border border-zinc-800/60" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
