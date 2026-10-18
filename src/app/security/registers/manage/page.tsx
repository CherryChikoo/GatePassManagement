import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { RegisterManager } from "@/components/registers/register-builder";
import { GoBackButton } from "@/components/ui/go-back-button";

/** Head Security designs registers; other security staff go back to the list. */
export default async function ManageRegistersPage() {
  const user = await requireRole("SECURITY");
  const { isHeadSecurity } = await getRegisterAccess(user);
  if (!isHeadSecurity) redirect("/security");
  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-3xl">
        <GoBackButton />
      </div>
      <RegisterManager base="/security" />
    </div>
  );
}
