import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-zinc-800/80 bg-zinc-900 p-6 sm:p-8 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
          <Compass className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-medium tracking-tight text-zinc-100">Page not found</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          The page you are looking for does not exist, or you do not have access to it.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-orange-600 px-6 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
        >
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
