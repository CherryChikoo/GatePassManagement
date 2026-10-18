import { requireRole } from "@/lib/auth/helpers";
import { BackButton } from "@/components/ui/back-button";
import { RegisterManager } from "@/components/registers/register-builder";

export default async function ManageRegistersPage() {
  await requireRole("ADMIN");
  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-3xl">
        <BackButton href="/admin/registers" label="All registers" />
      </div>
      <RegisterManager base="/admin" />
    </div>
  );
}
