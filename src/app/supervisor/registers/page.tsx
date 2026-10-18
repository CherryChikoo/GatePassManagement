import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { listAllRegisters } from "@/lib/registers/catalog";
import { RegistersHub } from "@/components/registers/register-pages";

export default async function RegistersPage() {
  const user = await requireRole("SECURITY_SUPERVISOR");
  const [access, registers] = await Promise.all([getRegisterAccess(user), listAllRegisters()]);
  const creatable = registers.filter((r) => access.canView(r.key) && access.canCreate(r.key)).map((r) => r.key);
  return <RegistersHub viewer="SECURITY_SUPERVISOR" hidden={access.hidden} creatable={creatable} registers={registers} canBuild={false} />;
}
