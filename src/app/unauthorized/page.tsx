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
    <div className="gradient-mesh min-h-screen flex items-center justify-center p-4">
      <div className="text-center animate-scale-in max-w-md w-full">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/15 text-red-400 mb-4 shadow-lg shadow-red-500/10">
          <Shield className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">
          Access Denied
        </h1>
        <p className="text-sm text-zinc-400 mb-2">
          You don&apos;t have permission to access this page.
        </p>
        <p className="text-xs text-zinc-500 mb-6">
          Currently signed in as <span className="text-zinc-300 font-medium">{user.email}</span> ({user.role})
        </p>

        <div className="max-w-xs mx-auto">
          {/* ONLY Action: Sign out and go to Login */}
          <SignOutButton className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-none transition-all cursor-pointer disabled:opacity-70 disabled:cursor-wait" />
        </div>
      </div>
    </div>
  );
}
