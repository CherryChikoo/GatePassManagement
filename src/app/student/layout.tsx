import { StudentShell } from "@/components/dashboard/student-shell";
import { avatarUrlFor, requireRole } from "@/lib/auth/helpers";
import { logoutAction } from "@/server/actions/auth";
import { StoreHydrator } from "@/components/providers/store-hydrator";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("STUDENT");

  return (
    <StudentShell userName={user.name} userEmail={user.email} avatarUrl={avatarUrlFor(user)} onLogout={logoutAction}>
      <StoreHydrator user={{ name: user.name, email: user.email, role: user.role, profileId: user.profileId }} />
      {children}
    </StudentShell>
  );
}
