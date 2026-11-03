import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { listAllRegisters } from "@/lib/registers/catalog";
import { RegistersHub } from "@/components/registers/register-pages";
import { isCustomRegisterKey } from "@/lib/registers/custom";

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
      // Built-in registers are already in the app: only portal-made ones are sent (small page, quick return)
      extraRegisters={registers.filter((r) => isCustomRegisterKey(r.key))}
      canBuild={false}
    />
  );
}
