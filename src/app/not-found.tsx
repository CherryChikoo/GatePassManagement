import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-2xl border border-zinc-800 text-center space-y-4">
        <h2 className="text-xl font-bold text-zinc-100">Page not found</h2>
        <p className="text-sm text-zinc-400">
          The page you are looking for does not exist, or you do not have access to it.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-semibold text-white"
        >
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
