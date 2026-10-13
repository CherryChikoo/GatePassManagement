"use client";

import { useEffect, useState } from "react";

export function TopLoadingBar({ active = false }: { active?: boolean }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      if (progress > 0) {
        setProgress(100);
        const timer = setTimeout(() => setProgress(0), 400);
        return () => clearTimeout(timer);
      }
      return;
    }

    setProgress(25);
    const timer1 = setTimeout(() => setProgress(60), 100);
    const timer2 = setTimeout(() => setProgress(85), 300);
    const timer3 = setTimeout(() => setProgress(95), 800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [active]);

  if (!active && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[99999] h-1 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-500 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
