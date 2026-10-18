import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { listAllRegisters } from "@/lib/registers/catalog";
import { RegistersHub } from "@/components/registers/register-pages";

/** Security home = the registers list (with "+" to add an entry straight away). */
export default async function SecurityHomePage() {
  const user = await requireRole("SECURITY");
  // Built-in + portal-created registers, read fresh so new ones appear immediately
  const [access, registers] = await Promise.all([getRegisterAccess(user), listAllRegisters()]);
  const creatable = registers.filter((r) => access.canView(r.key) && access.canCreate(r.key)).map((r) => r.key);
  return (
    <RegistersHub
      viewer="SECURITY"
      hidden={access.hidden}
      creatable={creatable}
      registers={registers}
      canBuild={access.isHeadSecurity}
    />
  );
}
