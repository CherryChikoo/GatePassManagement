import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { RegistersHub } from "@/components/registers/register-pages";

export default async function RegistersPage() {
  const user = await requireRole("ADMIN");
  const { hidden } = await getRegisterAccess(user);
  return <RegistersHub viewer="ADMIN" hidden={hidden} />;
}
