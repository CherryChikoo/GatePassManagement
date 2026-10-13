"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
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
    info: <Info className="h-6 w-6" />,
    success: <CheckCircle2 className="h-6 w-6" />,
    warning: <AlertCircle className="h-6 w-6" />,
    error: <XCircle className="h-6 w-6" />,
  };

  const colorMap = {
    info: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    success: "text-green-400 bg-green-500/10 border-green-500/30",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    error: "text-red-400 bg-red-500/10 border-red-500/30",
  };

  const buttonColorMap = {
    info: "bg-blue-600 hover:bg-blue-500 focus:ring-blue-500",
    success: "bg-green-600 hover:bg-green-500 focus:ring-green-500",
    warning: "bg-amber-600 hover:bg-amber-500 focus:ring-amber-500",
    error: "bg-red-600 hover:bg-red-500 focus:ring-red-500",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full mx-3 sm:mx-4 animate-in zoom-in-95 fade-in duration-200">
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Icon */}
          <div className={`flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full border ${colorMap[type]}`}>
            {iconMap[type]}
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-semibold text-zinc-100">
              {title}
            </h3>
            {description && (
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3 pt-2">
            {showCancel && (
              <button
                onClick={handleCancel}
                className="flex-1 px-3 sm:px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-xl text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`flex-1 px-3 sm:px-4 py-2.5 text-white rounded-xl text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 shadow-lg ${buttonColorMap[type]} ${
                showCancel ? "" : "w-full"
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
