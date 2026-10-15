import { requireRole } from "@/lib/auth/helpers";
import { getT } from "@/lib/i18n/server";
import { FacultyBookView } from "@/components/registers/derived-views";

export default async function SecurityFacultyPage() {
  await requireRole("SECURITY");
  const t = await getT();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">{t("Faculty Passes")}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("Approved faculty gate passes for the selected day. Tap a row to see the full pass.")}
        </p>
      </div>
      <FacultyBookView canMarkIn />
    </div>
  );
}
