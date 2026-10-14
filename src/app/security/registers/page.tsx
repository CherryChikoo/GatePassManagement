import { requireRole } from "@/lib/auth/helpers";
import { RegistersHub } from "@/components/registers/register-pages";

export default async function RegistersPage() {
  await requireRole("SECURITY");
  return <RegistersHub viewer="SECURITY" />;
}
