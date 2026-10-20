"use client";

import { useEffect } from "react";

/**
 * Larger text on Security screens (see .security-text in globals.css).
 * The page itself sits inside this wrapper; popups are drawn at the end of
 * <body>, outside it, so <html> also gets the class while a Security page is
 * open (popups only open after the page is interactive, so this is in time).
 */
export function SecurityText({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("security-text");
    return () => root.classList.remove("security-text");
  }, []);
  return <div className="security-text contents">{children}</div>;
}
