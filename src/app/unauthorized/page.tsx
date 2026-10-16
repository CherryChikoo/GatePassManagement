import { Shield } from "lucide-react";
import { SignOutButton } from "@/components/ui/sign-out-submit-button";
import { getAuthUser } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";

export default async function UnauthorizedPage() {
  const user = await getAuthUser();

  // If not logged in, redirect to login immediately
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-zinc-800/80 bg-zinc-900 p-6 sm:p-8 text-center shadow-card animate-scale-in">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <Shield className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-light tracking-tight text-zinc-100">Access denied</h1>
        <p className="mt-2 text-sm text-zinc-500">You don&apos;t have permission to access this page.</p>
        <p className="mt-4 rounded-2xl bg-zinc-950 px-4 py-3 text-xs text-zinc-500 break-words">
          Signed in as <span className="font-medium text-zinc-200">{user.email}</span> ({user.role})
        </p>

        <div className="mt-6">
          {/* Only action: sign out and go to the login page */}
          <SignOutButton className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-full bg-orange-600 hover:bg-orange-700 px-5 text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-wait" />
        </div>
      </div>
    </div>
  );
}
