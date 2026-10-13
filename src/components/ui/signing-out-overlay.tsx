import { Loader2 } from "lucide-react";

/** Full-screen overlay shown while the session is being ended and the login page loads. */
export function SigningOutOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-8 py-6 shadow-2xl">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-zinc-100">Signing out…</p>
        <p className="text-xs text-zinc-500">Clearing your session securely</p>
      </div>
    </div>
  );
}
