import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { REGISTER_KEYS } from "@/lib/registers/definitions";
import { RegistersHub } from "@/components/registers/register-pages";

/** Security home = the registers list (with "+" to add an entry straight away). */
export default async function SecurityHomePage() {
  const user = await requireRole("SECURITY");
  const access = await getRegisterAccess(user);
  const creatable = REGISTER_KEYS.filter((k) => access.canView(k) && access.canCreate(k));
  return <RegistersHub viewer="SECURITY" hidden={access.hidden} creatable={creatable} />;
}
