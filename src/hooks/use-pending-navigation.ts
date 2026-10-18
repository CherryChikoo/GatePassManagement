"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * router.push that reports while the new page data is loading, e.g. after
 * picking a date on a page whose list comes from the URL (?date=…).
 */
export function usePendingNavigation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const push = useCallback(
    (url: string) => startTransition(() => router.push(url, { scroll: false })),
    [router]
  );
  return { push, isPending };
}
