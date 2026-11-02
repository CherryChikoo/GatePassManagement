import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { getRegisterAccess } from "@/lib/registers/access";
import { getRegisterBySlug } from "@/lib/registers/catalog";
import { isEntryRegister } from "@/lib/registers/definitions";
import { RegisterPage } from "@/components/registers/register-pages";
import { AdmissionHub } from "./admission-hub";

export default async function RegisterDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireRole("SECURITY");
  const { slug } = await params;
  // Built-in or portal-created register
  const [def, access] = await Promise.all([getRegisterBySlug(slug), getRegisterAccess(user)]);
  if (!def || !access.canView(def.key)) notFound();
  // Security has one visitors screen (its 4 buttons)
  if (def.key === "VISITORS") redirect("/security/visitors");
  // Admission Book: the same 4 buttons (Show QR · Type it myself · Inside now · Old records)
  if (def.key === "ADMISSION" && isEntryRegister(def)) return <AdmissionHub register={def} canCreate={access.canCreate(def.key)} />;
  return <RegisterPage registerKey={def.key} register={def} viewer="SECURITY" canCreate={access.canCreate(def.key)} />;
}
