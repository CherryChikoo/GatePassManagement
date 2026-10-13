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
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium shadow-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]";

    const variants: Record<string, string> = {
      default:
        "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-none hover:from-indigo-500 hover:to-violet-500 focus-visible:ring-indigo-500",
      destructive:
        "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-none hover:from-red-500 hover:to-rose-500 focus-visible:ring-red-500",
      outline:
        "border border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 focus-visible:ring-zinc-500 shadow-none",
      secondary:
        "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 focus-visible:ring-zinc-500 shadow-none",
      ghost:
        "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 focus-visible:ring-zinc-500 shadow-none",
      link: "text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300 focus-visible:ring-indigo-500 shadow-none",
      success:
        "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-none hover:from-emerald-500 hover:to-green-500 focus-visible:ring-emerald-500",
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
