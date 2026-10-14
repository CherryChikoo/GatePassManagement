/**
 * Roles that use the shared read-only oversight screens (student / faculty /
 * HOD directories and the campus activity log).
 */
export type OversightRole = "DIRECTOR" | "DEAN" | "SECURITY_SUPERVISOR";

export function oversightRoleMeta(role: OversightRole) {
  switch (role) {
    case "DIRECTOR":
      return {
        path: "director",
        title: "Director Oversight",
        accent: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      };
    case "DEAN":
      return {
        path: "dean",
        title: "Dean Oversight",
        accent: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      };
    case "SECURITY_SUPERVISOR":
      return {
        path: "supervisor",
        title: "Security Supervisor · View only",
        accent: "bg-teal-500/15 text-teal-400 border-teal-500/30",
      };
  }
}
