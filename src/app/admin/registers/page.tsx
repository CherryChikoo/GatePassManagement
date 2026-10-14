import { requireRole } from "@/lib/auth/helpers";
import { RegistersHub } from "@/components/registers/register-pages";

export default async function RegistersPage() {
  await requireRole("ADMIN");
  return <RegistersHub viewer="ADMIN" />;
}
