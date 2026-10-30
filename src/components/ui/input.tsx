import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  /** Classes for the outer wrapper (label + field), e.g. a grid column span */
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, type, id, wrapperClassName, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className={cn("flex flex-col gap-1", wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="field-label block text-sm font-medium text-zinc-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              {icon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              "flex h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50",
              "hover:border-zinc-700",
              "disabled:cursor-not-allowed disabled:opacity-50",
              icon ? "pl-11 pr-4" : "px-4",
              error && "border-red-500/50 focus:ring-red-500/40 focus:border-red-500/50",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
