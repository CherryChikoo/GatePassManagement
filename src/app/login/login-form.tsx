"use client";

import { useState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Mail, Lock, ArrowRight } from "lucide-react";
import { broadcastSessionEvent, hardNavigate } from "@/stores/app-store";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
        hardNavigate(result.redirectUrl);
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="gradient-mesh min-h-screen flex items-center justify-center p-3 sm:p-4 md:p-6">
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        {/* Logo Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-orange-600 shadow-xl mb-3 sm:mb-4">
            <Shield className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            GatePass Portal
          </h1>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-zinc-400">
            Campus Permission & Movement Management
          </p>
        </div>

        {/* Login Card */}
        <div className="glass rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
          <div className="mb-5 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-100">
              Welcome back
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Sign in to access your dashboard
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs sm:text-sm text-red-400 animate-fade-in">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              name="email"
              type="email"
              label="Email Address"
              placeholder="you@campus.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              icon={<Mail className="h-4 w-4" />}
              id="login-email"
            />

            <Input
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              icon={<Lock className="h-4 w-4" />}
              id="login-password"
            />

            <Button
              type="submit"
              className="w-full mt-1"
              size="lg"
              loading={loading}
            >
              {!loading && (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
              {loading && "Signing in..."}
            </Button>
          </form>
          </div>
        </div>

        <p className="mt-5 sm:mt-6 text-center text-xs text-zinc-500">
          Contact your administrator if you don&apos;t have an account
        </p>
      </div>
    </div>
  );
}
