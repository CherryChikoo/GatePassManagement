import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "success";
  size?: "default" | "sm" | "lg" | "icon";
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]";

    const variants: Record<string, string> = {
      // Brand coral pill (deep coral keeps white text readable)
      // Coral glass: gradient body, a light top edge (inner highlight), a soft coral glow
      default:
        "bg-gradient-to-b from-[#ff7a5e] to-[#e0442a] text-white ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_22px_-12px_rgba(207,62,37,0.75)] hover:brightness-[1.06] focus-visible:ring-orange-500",
      destructive:
        "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
      // Glass outline: frosted white with a coral edge and coral text
      outline:
        "border border-orange-500/25 bg-white/70 text-orange-600 shadow-[inset_0_1px_0_#ffffff,0_6px_16px_-12px_rgba(207,62,37,0.45)] hover:border-orange-500/45 hover:bg-orange-500/[0.06] focus-visible:ring-orange-500",
      secondary:
        "bg-zinc-950 text-zinc-200 hover:bg-zinc-800 focus-visible:ring-zinc-600",
      ghost:
        "text-zinc-400 hover:bg-zinc-950 hover:text-zinc-200 focus-visible:ring-zinc-600",
      link: "text-orange-400 underline-offset-4 hover:underline hover:text-orange-300 focus-visible:ring-orange-500",
      success:
        "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500",
    };

    const sizes: Record<string, string> = {
      default: "h-11 px-5 py-2.5 text-sm",
      sm: "h-9 px-3.5 text-xs",
      lg: "h-12 px-8 text-base",
      icon: "h-10 w-10",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
