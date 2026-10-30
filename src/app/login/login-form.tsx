"use client";
import { useT } from "@/components/providers/language-provider";

import { useEffect, useState } from "react";
import { loginAction } from "@/server/actions/auth";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { broadcastSessionEvent } from "@/stores/app-store";
import { isStaleDeploymentError, reloadForNewDeployment } from "@/lib/deployment";

export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // First visit on a slow phone: the page shows before its code has loaded. A tap
  // on Sign in then would only reload the page, so the button waits until ready.
  // The fields are left uncontrolled so anything typed meanwhile is kept.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    // Wake the server and its database connection while the person types, so
    // signing in does not wait for a sleeping server (free plan)
    fetch("/api/health", { cache: "no-store" }).catch(() => {});
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await loginAction(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else if (result?.redirectUrl) {
        // Other open tabs switch to this user (one session per browser)
        broadcastSessionEvent("login");
        // In-app move: the scripts are already loaded, so the dashboard opens
        // without a full page reload (nothing from another user is cached here —
        // signing out always reloads the page)
        router.replace(result.redirectUrl);
      }
    } catch (err: any) {
      // Page was opened before a new deployment → reload it and let the user sign in again
      if (isStaleDeploymentError(err)) {
        setError(t("A new version of Gate Pass is available. Reloading…"));
        if (reloadForNewDeployment()) return;
        setError(t("A new version of Gate Pass is available. Please refresh this page and sign in again."));
        setLoading(false);
        return;
      }
      setError(t("Could not sign in. Check your connection and try again."));
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#f2f2f3] flex items-center justify-center px-4 py-6 sm:py-10">
      {/* Soft grey page with a faint grid fading out from the centre */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(24,24,27,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,0.045) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          backgroundPosition: "center center",
          WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, #000 30%, transparent 100%)",
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, #000 30%, transparent 100%)",
        }}
      />
      {/* Gentle coral glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(38rem 30rem at 50% 50%, rgba(255,99,74,0.09), transparent 70%)" }}
      />

      <div className="relative w-full max-w-[440px] animate-scale-in">
        {/* Card: white, with a faint coral glow and grid behind the logo */}
        <div className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] border border-[#ececee] bg-white px-5 py-7 sm:p-9 shadow-[0_24px_60px_-28px_rgba(16,24,40,0.18),0_1px_2px_rgba(16,24,40,0.04)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-64"
            style={{
              background: "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(255,99,74,0.13), transparent 75%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-64"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,99,74,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,99,74,0.10) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              backgroundPosition: "center top",
              WebkitMaskImage: "radial-gradient(ellipse 60% 90% at 50% 0%, #000 20%, transparent 80%)",
              maskImage: "radial-gradient(ellipse 60% 90% at 50% 0%, #000 20%, transparent 80%)",
            }}
          />
          <div className="relative">
          {/* Full college logo */}
          <Image
            src="/brand/logo-full.webp"
            alt="Ramachandra College of Engineering (Autonomous)"
            width={900}
            height={192}
            priority
            sizes="(max-width: 640px) 85vw, 360px"
            className="mx-auto h-auto w-full max-w-[300px] sm:max-w-[340px]"
          />

          <div className="mt-6 sm:mt-7 text-center">
            <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-zinc-100">{t("Sign in to Gate Pass")}</h1>
            <p className="mx-auto mt-2 max-w-[300px] text-sm sm:text-[15px] leading-relaxed text-zinc-500">
              {t("Campus gate passes for students, faculty and staff.")}
            </p>
          </div>

          {error && (
            <div role="alert" className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 animate-fade-in flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{t(error)}</span>
            </div>
          )}

          <form method="post" onSubmit={handleSubmit} className="mt-6 sm:mt-7 flex flex-col gap-3">
            <label htmlFor="login-email" className="sr-only">{t("Email")}</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t("Email")}
                required
                className="h-12 w-full rounded-2xl border border-transparent bg-[#eef0f3] pl-11 pr-4 text-base sm:text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-orange-500/50 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
              />
            </div>

            <label htmlFor="login-password" className="sr-only">{t("Password")}</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("Password")}
                required
                className="h-12 w-full rounded-2xl border border-transparent bg-[#eef0f3] pl-11 pr-12 text-base sm:text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-orange-500/50 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-zinc-500 hover:bg-white hover:text-zinc-200"
                aria-label={showPassword ? t("Hide password") : t("Show password")}
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgot((v) => !v)}
                aria-expanded={showForgot}
                className="py-1 text-sm font-medium text-zinc-200 hover:text-orange-400 transition-colors"
              >
                {t("Forgot password?")}
              </button>
            </div>
            {showForgot && (
              <p className="rounded-2xl bg-white/80 border border-zinc-800 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400 animate-fade-in">
                {t("Ask your HOD or the administrator to reset it. Students and faculty can get a new password from their HOD.")}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !ready}
              aria-busy={loading || !ready}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-white transition-[transform,filter] active:scale-[0.99] hover:brightness-110 disabled:opacity-70 disabled:cursor-wait shadow-[0_10px_24px_-10px_rgba(16,24,40,0.55),inset_0_1px_0_rgba(255,255,255,0.15)]"
              style={{ background: "linear-gradient(180deg, #3a3b40 0%, #17181b 100%)" }}
            >
              {loading || !ready ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loading ? t("Signing in…") : t("Loading…")}
                </>
              ) : (
                t("Sign in")
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-500">
            {t("Don't have an account? Contact your administrator.")}
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}
