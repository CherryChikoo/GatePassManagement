"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  href: string;
  label?: string;
  className?: string;
}

export function BackButton({ href, label = "Back to Dashboard", className }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.push(href)}
      className={cn(
        "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors gap-2",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
