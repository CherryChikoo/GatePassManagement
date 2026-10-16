import { requireRole } from "@/lib/auth/helpers";
import { getT } from "@/lib/i18n/server";
import { FacultyBookView } from "@/components/registers/derived-views";
import { GoBackButton } from "@/components/ui/go-back-button";

export default async function SecurityFacultyPage() {
  await requireRole("SECURITY");
  const t = await getT();
  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <div className="min-w-0">
        <GoBackButton className="mb-3" />
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">{t("Faculty Passes")}</h1>
        <p className="mt-1 text-sm text-zinc-500 max-w-2xl">
          {t("Approved faculty gate passes for the selected day. Tap a row to see the full pass.")}
        </p>
      </div>
      <FacultyBookView canMarkIn />
    </div>
  );
}
