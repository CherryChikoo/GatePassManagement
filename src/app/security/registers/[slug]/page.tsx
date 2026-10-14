import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { registerFromSlug } from "@/lib/registers/definitions";
import { RegisterPage } from "@/components/registers/register-pages";

export default async function RegisterDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireRole("SECURITY");
  const { slug } = await params;
  const def = registerFromSlug(slug);
  if (!def) notFound();
  return <RegisterPage registerKey={def.key} viewer="SECURITY" />;
}
