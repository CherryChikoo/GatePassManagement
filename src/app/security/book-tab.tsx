import Link from "next/link";
import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { RegistersHub } from "@/components/registers/register-pages";

/**
 * Security's bottom tabs other than Registers (Daily labours, Passes, Siros):
 * the same book tiles as the Registers screen, only this tab's books.
 * Opening a tile opens the book as usual.
 */
export async function SecurityBookTab({ title, keys, footer }: { title: string; keys: string[]; footer?: React.ReactNode }) {
  const user = await requireRole("SECURITY");
  const access = await getRegisterAccess(user);
  const creatable = keys.filter((k) => access.canView(k) && access.canCreate(k));
  return <RegistersHub viewer="SECURITY" hidden={access.hidden} creatable={creatable} only={{ title, keys }} footer={footer} />;
}

/** A big one-line link tile (e.g. Gate Logs on the Passes tab) */
export function TabLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch
      className="flex items-center gap-3 rounded-3xl border-[1.5px] border-zinc-800 bg-zinc-900 px-4 py-4 shadow-card transition-[background-color,transform] hover:bg-zinc-950 active:scale-[0.99]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-xl font-bold leading-snug text-zinc-100">{label}</span>
    </Link>
  );
}
