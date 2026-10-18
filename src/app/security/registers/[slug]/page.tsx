import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { getRegisterBySlug } from "@/lib/registers/catalog";
import { RegisterPage } from "@/components/registers/register-pages";

export default async function RegisterDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireRole("SECURITY");
  const { slug } = await params;
  // Built-in or portal-created register
  const def = await getRegisterBySlug(slug);
  const access = await getRegisterAccess(user);
  if (!def || !access.canView(def.key)) notFound();
  return <RegisterPage registerKey={def.key} register={def} viewer="SECURITY" canCreate={access.canCreate(def.key)} />;
}
