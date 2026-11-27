"use client";

import { lockPageScroll } from "@/lib/ui/scroll-lock";
import { useEffect } from "react";
import { useSecurityLook } from "@/lib/ui/security-look";
import { AlertCircle, CheckCircle2, XCircle, Info, X } from "lucide-react";

interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  type?: "info" | "success" | "warning" | "error";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function AlertDialog({
  open,
  onClose,
  title,
  description,
  type = "info",
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  showCancel = false,
}: AlertDialogProps) {
  const solid = useSecurityLook();
  useEffect(() => {
    if (!open) return;
    return lockPageScroll();
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  const iconMap = {
    info: <Info className="h-7 w-7" />,
    success: <CheckCircle2 className="h-7 w-7" />,
    warning: <AlertCircle className="h-7 w-7" />,
    error: <XCircle className="h-7 w-7" />,
  };

  // Icon tile and main button: a glossy gradient per kind (Security: plain solid colours)
  const tileMap = {
    info: "from-[#ff7a66] to-[#d6331f] shadow-[0_12px_24px_-12px_rgba(232,73,46,0.7)]",
    success: "from-[#34d399] to-[#059669] shadow-[0_12px_24px_-12px_rgba(5,150,105,0.7)]",
    warning: "from-[#fbbf24] to-[#d97706] shadow-[0_12px_24px_-12px_rgba(217,119,6,0.7)]",
    error: "from-[#ff6b5e] to-[#d92d20] shadow-[0_12px_24px_-12px_rgba(217,45,32,0.7)]",
  };
  const solidButton = {
    info: "bg-blue-600 hover:bg-blue-500",
    success: "bg-green-600 hover:bg-green-500",
    warning: "bg-amber-600 hover:bg-amber-500",
    error: "bg-red-600 hover:bg-red-500",
  };
  const gloss = "shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={solid ? "absolute inset-0 bg-black/40 animate-in fade-in duration-200" : "absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-in fade-in duration-200"}
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-3xl border border-orange-500/10 bg-white shadow-[0_30px_70px_-24px_rgba(16,24,40,0.45)] animate-in zoom-in-95 fade-in duration-200"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          {/* Icon */}
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b text-white ${tileMap[type]}`}>
            {iconMap[type]}
          </div>

          {/* Content */}
          <h3 className="mt-4 text-lg font-semibold text-zinc-100">{title}</h3>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{description}</p>}

          {/* Actions */}
          <div className="mt-6 flex w-full flex-col-reverse gap-2.5 min-[380px]:flex-row">
            {showCancel && (
              <button
                type="button"
                onClick={handleCancel}
                className={
                  solid
                    ? "h-12 flex-1 rounded-2xl border-2 border-red-500 bg-red-50 px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
                    : "h-12 flex-1 rounded-2xl border border-zinc-800 bg-white px-4 text-sm font-semibold text-zinc-200 shadow-[0_6px_16px_-12px_rgba(16,24,40,0.35)] transition-colors hover:bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                }
              >
                {cancelText}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className={`h-12 flex-1 rounded-2xl px-4 text-sm font-semibold text-white transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${
                solid ? solidButton[type] : `bg-gradient-to-b ${tileMap[type]} ${gloss}`
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Confirmation dialog variant
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: "danger" | "warning" | "info";
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  variant = "warning",
}: ConfirmDialogProps) {
  const type = variant === "danger" ? "error" : variant === "warning" ? "warning" : "info";

  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      type={type}
      confirmText={confirmText}
      cancelText={cancelText}
      onConfirm={onConfirm}
      onCancel={onClose}
      showCancel={true}
    />
  );
}
