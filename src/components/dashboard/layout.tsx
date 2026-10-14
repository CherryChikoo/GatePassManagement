"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { logoutAndClear } from "@/stores/app-store";
import { SigningOutOverlay } from "@/components/ui/signing-out-overlay";
import {
  LayoutDashboard,
  FileText,
  Users,
  Shield,
  QrCode,
  Camera,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Building2,
  ClipboardCheck,
  History,
  UserCog,
  DoorOpen,
  ScanLine,
  Bell,
  Eye,
  Landmark,
  GraduationCap,
  Loader2,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  defaultCollapsed?: boolean;
}

export function DashboardLayout({
  children,
  role,
  userName,
  userEmail,
  onLogout,
  defaultCollapsed = false,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();

  // Clear all cached client data before ending the server session
  const [signingOut, setSigningOut] = useState(false);
  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSidebarOpen(false);
    try {
      await logoutAndClear(async () => onLogout());
    } catch (err: any) {
      // A successful logout redirects (navigation unmounts this overlay).
      // Anything else is a real failure: let the user try again.
      if (!String(err?.digest ?? err?.message ?? "").includes("NEXT_REDIRECT")) {
        setSigningOut(false);
      }
    }
  };

  let navItems: NavItem[] = [];
  if (role === "ADMIN") navItems = adminNavItems;
  else if (role === "FACULTY") navItems = facultyNavItems;
  else if (role === "FACULTY_ADMIN") navItems = facultyAdminNavItems;
  else if (role === "WARDEN") navItems = wardenNavItems;
  else if (role === "SECURITY") navItems = securityNavItems;
  else if (role === "STUDENT") navItems = studentNavItems;
  else if (role === "DIRECTOR") navItems = directorNavItems;
  else if (role === "DEAN") navItems = deanNavItems;
  else if (role === "SECURITY_SUPERVISOR") navItems = supervisorNavItems;

  useEffect(() => {
    const saved = localStorage.getItem("gatepass_sidebar_collapsed");
    if (saved && !document.cookie.includes("gatepass_sidebar_collapsed")) {
      setDesktopCollapsed(saved === "true");
      document.cookie = `gatepass_sidebar_collapsed=${saved}; path=/; max-age=31536000`;
    }
  }, []);
  
  const handleNavigation = () => {
    setSidebarOpen(false);
  };

  const roleColors: Record<string, string> = {
    ADMIN: "from-violet-600 to-purple-600",
    STUDENT: "from-blue-600 to-cyan-600",
    FACULTY: "from-orange-500 to-amber-600",
    FACULTY_ADMIN: "from-indigo-500 to-violet-600",
    WARDEN: "from-amber-600 to-orange-600",
    SECURITY: "from-red-600 to-rose-600",
    DIRECTOR: "from-emerald-600 to-teal-600",
    DEAN: "from-sky-600 to-blue-600",
    SECURITY_SUPERVISOR: "from-teal-600 to-emerald-600",
  };

  const roleGlow: Record<string, string> = {
    ADMIN: "shadow-violet-500/20",
    STUDENT: "shadow-blue-500/20",
    FACULTY: "shadow-orange-500/20",
    FACULTY_ADMIN: "shadow-indigo-500/20",
    WARDEN: "shadow-amber-500/20",
    SECURITY: "shadow-red-500/20",
    DIRECTOR: "shadow-emerald-500/20",
    DEAN: "shadow-sky-500/20",
    SECURITY_SUPERVISOR: "shadow-teal-500/20",
  };

  const isMobileNavRole = role === "STUDENT" || role === "SECURITY";

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Auto-close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Only show if there are navigation items */}
      {navItems.length > 0 && (
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-800/60 bg-zinc-950/95 backdrop-blur-xl transition-all duration-300 lg:static lg:translate-x-0 shadow-2xl lg:shadow-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            desktopCollapsed ? "lg:w-20" : "lg:w-64",
            "w-72" // Mobile width
          )}
        >
        {/* Logo & Role */}
        <div className="flex items-center justify-between border-b border-zinc-800/50 py-4 px-4 sm:px-5">
          <div className="flex items-center min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg",
                roleColors[role] || roleColors.ADMIN,
                roleGlow[role] || roleGlow.ADMIN
              )}
            >
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div
              className={cn(
                "flex flex-col overflow-hidden transition-all duration-300 whitespace-nowrap min-w-0 w-full opacity-100 ml-3",
                desktopCollapsed && "lg:w-0 lg:opacity-0 lg:ml-0"
              )}
            >
              <h1 className="text-sm font-bold text-zinc-100 tracking-tight truncate">
                GatePass Portal
              </h1>
              <p className="text-xs text-zinc-500 font-medium truncate">
                {role === "FACULTY_ADMIN" ? "HOD" : role === "DIRECTOR" ? "DIRECTOR" : role === "DEAN" ? "DEAN" : role === "SECURITY_SUPERVISOR" ? "SUPERVISOR" : role} Dashboard
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isRootPath =
              item.href === "/admin" ||
              item.href === "/faculty" ||
              item.href === "/faculty-admin" ||
              item.href === "/director" ||
              item.href === "/dean" ||
              item.href === "/supervisor" ||
              item.href === "/warden" ||
              item.href === "/student" ||
              item.href === "/security";
            const isActive = isRootPath
              ? pathname === item.href
              : pathname === item.href || (pathname.startsWith(item.href + "/") && item.href !== "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavigation}
                className={cn(
                  "group flex items-center rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-100 overflow-hidden",
                  isActive
                    ? cn(
                        "bg-gradient-to-r text-white shadow-lg",
                        roleColors[role] || roleColors.ADMIN,
                        roleGlow[role] || roleGlow.ADMIN
                      )
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                )}
              >
                <span className={cn("flex-shrink-0", isActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300")}>
                  {item.icon}
                </span>
                <div
                  className={cn(
                    "flex flex-1 items-center justify-between overflow-hidden transition-all duration-300 min-w-0 w-full opacity-100 ml-3",
                    desktopCollapsed && "lg:w-0 lg:opacity-0 lg:ml-0"
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={cn(
                        "flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold px-1.5 shrink-0",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-indigo-500/20 text-indigo-400"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Sign Out in Drawer */}
        <div className="border-t border-zinc-800/50 p-4 space-y-2">
          <div className="flex items-center rounded-xl bg-zinc-900/50 py-2.5 px-3 overflow-hidden">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white text-sm font-bold",
                roleColors[role] || roleColors.ADMIN
              )}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div
              className={cn(
                "flex flex-col overflow-hidden transition-all duration-300 whitespace-nowrap min-w-0 w-full opacity-100 ml-3",
                desktopCollapsed && "lg:w-0 lg:opacity-0 lg:ml-0"
              )}
            >
              <p className="text-sm font-medium text-zinc-200 truncate">
                {userName}
              </p>
              <p className="text-xs text-zinc-500 truncate">{userEmail}</p>
            </div>
          </div>

          {/* Direct sign out in drawer on mobile */}
          <div className="lg:hidden pt-1">
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              aria-busy={signingOut}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-red-500/40 hover:bg-red-500/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-red-400 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
            </button>
          </div>
        </div>
      </aside>
      )}

      {/* Main Content */}
      <main className={cn("flex-1 flex flex-col min-w-0 max-w-full overflow-hidden relative", isMobileNavRole ? "pb-16 lg:pb-0" : "")}>
        <header className="flex items-center gap-3 sm:gap-4 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl px-3 sm:px-6 py-3 shrink-0">
          {navItems.length > 0 ? (
            <>
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  setDesktopCollapsed(prev => {
                    const next = !prev;
                    localStorage.setItem("gatepass_sidebar_collapsed", String(next));
                    document.cookie = `gatepass_sidebar_collapsed=${next}; path=/; max-age=31536000`;
                    return next;
                  });
                }}
                className="hidden lg:block rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 transition-colors"
                aria-label="Toggle sidebar width"
              >
                <Menu className="h-5 w-5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg",
                  roleColors[role] || roleColors.ADMIN,
                  roleGlow[role] || roleGlow.ADMIN
                )}
              >
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div className="hidden sm:block min-w-0">
                <h1 className="text-sm font-bold text-zinc-100 tracking-tight leading-tight truncate">
                  GatePass Portal
                </h1>
                <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider truncate">{role === "FACULTY_ADMIN" ? "HOD" : role === "DIRECTOR" ? "DIRECTOR" : role === "DEAN" ? "DEAN" : role === "SECURITY_SUPERVISOR" ? "SUPERVISOR" : role} Dashboard</p>
              </div>
            </div>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-2 sm:gap-4">
            {navItems.length === 0 && (
              <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-zinc-800/50">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white text-xs font-bold",
                    roleColors[role] || roleColors.ADMIN
                  )}
                >
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <p className="text-sm font-medium text-zinc-200 leading-tight truncate">
                    {userName}
                  </p>
                  <p className="text-[11px] text-zinc-500 leading-tight truncate">{userEmail}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              aria-busy={signingOut}
              className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-red-500/40 hover:bg-red-500/10 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-zinc-300 hover:text-red-400 transition-all cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-wait"
              title="Sign Out"
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign Out"}</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {signingOut && <SigningOutOverlay />}

      {/* Mobile Bottom Navigation Bar */}
      {isMobileNavRole && navItems.length > 0 && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/60 px-1 h-16 pb-safe">
          {navItems.map((item) => {
            const isRootPath =
              item.href === "/admin" ||
              item.href === "/faculty" ||
              item.href === "/faculty-admin" ||
              item.href === "/director" ||
              item.href === "/dean" ||
              item.href === "/supervisor" ||
              item.href === "/warden" ||
              item.href === "/student" ||
              item.href === "/security";
            const isActive = isRootPath
              ? pathname === item.href
              : pathname === item.href || (pathname.startsWith(item.href + "/") && item.href !== "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors relative",
                  isActive ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                )}
                <span className={cn(isActive ? "scale-110" : "")}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium tracking-tight truncate max-w-[64px] text-center">
                  {item.label}
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-1 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white px-1">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Pre-built nav items per role
// ──────────────────────────────────────────────────────────────

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "User Management", href: "/admin/users", icon: <Users className="h-5 w-5" /> },
  { label: "Gate Management", href: "/admin/gates", icon: <DoorOpen className="h-5 w-5" /> },
  { label: "Activity Logs", href: "/admin/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
  // The following pages are not yet implemented in the initial build:
  // { label: "All Permissions", href: "/admin/permissions", icon: <ClipboardCheck className="h-5 w-5" /> },
  // { label: "Movement Log", href: "/admin/movements", icon: <History className="h-5 w-5" /> },
  // { label: "Audit Log", href: "/admin/audit", icon: <FileText className="h-5 w-5" /> },
];

export const studentNavItems: NavItem[] = [
  { label: "Dashboard", href: "/student", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Apply Pass", href: "/student/request", icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: "History", href: "/student/history", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];

export const facultyNavItems: NavItem[] = [
  { label: "Dashboard", href: "/faculty", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "My Passes", href: "/faculty/apply", icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: "My Students", href: "/faculty/students", icon: <Users className="h-5 w-5" /> },
  { label: "Activity", href: "/faculty/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];

export const facultyAdminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/faculty-admin", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Requests", href: "/faculty-admin/requests", icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: "Students", href: "/faculty-admin/students", icon: <Users className="h-5 w-5" /> },
  { label: "Faculty", href: "/faculty-admin/faculty", icon: <Users className="h-5 w-5" /> },
  { label: "Activity", href: "/faculty-admin/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];

export const wardenNavItems: NavItem[] = [
  { label: "Dashboard", href: "/warden", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Hostel Students", href: "/warden/students", icon: <Users className="h-5 w-5" /> },
  { label: "Requests", href: "/warden/requests", icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: "Activity", href: "/warden/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
  // Unimplemented:
  // { label: "Approval History", href: "/warden/history", icon: <History className="h-5 w-5" /> },
];

export const securityNavItems: NavItem[] = [
  { label: "Dashboard", href: "/security", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Scan QR", href: "/security/scan", icon: <ScanLine className="h-5 w-5" /> },
  { label: "Outsiders", href: "/security/outsiders", icon: <Users className="h-5 w-5" /> },
  { label: "Gate Logs", href: "/security/log", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];

export const directorNavItems: NavItem[] = [
  { label: "Dashboard", href: "/director", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "All Students", href: "/director/students", icon: <GraduationCap className="h-5 w-5" /> },
  { label: "All HODs", href: "/director/hods", icon: <Users className="h-5 w-5" /> },
  { label: "All Faculty", href: "/director/faculty", icon: <Users className="h-5 w-5" /> },
  { label: "Activity", href: "/director/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];

export const deanNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dean", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Faculty Passes", href: "/dean/requests", icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: "All Students", href: "/dean/students", icon: <GraduationCap className="h-5 w-5" /> },
  { label: "All HODs", href: "/dean/hods", icon: <Users className="h-5 w-5" /> },
  { label: "All Faculty", href: "/dean/faculty", icon: <Users className="h-5 w-5" /> },
  { label: "Activity", href: "/dean/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];

// Security Supervisor: view-only oversight (no approve / reject anywhere)
export const supervisorNavItems: NavItem[] = [
  { label: "Dashboard", href: "/supervisor", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Requests", href: "/supervisor/requests", icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: "Students", href: "/supervisor/students", icon: <GraduationCap className="h-5 w-5" /> },
  { label: "Faculty", href: "/supervisor/faculty", icon: <Users className="h-5 w-5" /> },
  { label: "Activity", href: "/supervisor/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];