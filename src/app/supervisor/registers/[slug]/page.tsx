import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { registerFromSlug } from "@/lib/registers/definitions";
import { RegisterPage } from "@/components/registers/register-pages";

export default async function RegisterDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireRole("SECURITY_SUPERVISOR");
  const { slug } = await params;
  const def = registerFromSlug(slug);
  const access = await getRegisterAccess(user);
  if (!def || !access.canView(def.key)) notFound();
  return <RegisterPage registerKey={def.key} viewer="SECURITY_SUPERVISOR" canCreate={access.canCreate(def.key)} />;
}
