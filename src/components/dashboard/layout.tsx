"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { logoutAndClear } from "@/stores/app-store";
import { SigningOutOverlay } from "@/components/ui/signing-out-overlay";
import { LanguageToggle, useT } from "@/components/providers/language-provider";
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
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Briefcase,
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
  /** Shown instead of "<ROLE> Dashboard", e.g. "Dean of Placements" */
  roleTitle?: string;
}

/** College mark + "Gate Pass" + the role line (labels hide when the sidebar is collapsed). */
function BrandMark({ compact = false, roleLine }: { compact?: boolean; roleLine: string }) {
  return (
    <div className="flex items-center min-w-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 shadow-card">
        <Image src="/brand/logo-mark.webp" alt="Ramachandra College of Engineering" width={28} height={28} priority />
      </span>
      <div
        className={cn(
          "flex flex-col overflow-hidden whitespace-nowrap min-w-0 ml-3 transition-[opacity,width,margin] duration-300",
          compact && "lg:w-0 lg:opacity-0 lg:ml-0"
        )}
      >
        <span className="text-[15px] font-semibold text-zinc-100 tracking-tight leading-tight truncate">Gate Pass</span>
        <span className="text-[11px] text-zinc-500 leading-tight truncate">{roleLine}</span>
      </div>
    </div>
  );
}

export function DashboardLayout({
  children,
  role,
  userName,
  userEmail,
  onLogout,
  defaultCollapsed = false,
  roleTitle,
}: DashboardLayoutProps) {
  const t = useT();
  const roleLine =
    roleTitle ||
    t(`${role === "FACULTY_ADMIN" ? "HOD" : role === "DIRECTOR" ? "DIRECTOR" : role === "DEAN" ? "DEAN" : role === "SECURITY_SUPERVISOR" ? "SUPERVISOR" : role} Dashboard`);
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

  const ROOT_PATHS = ["/admin", "/faculty", "/faculty-admin", "/director", "/dean", "/supervisor", "/warden", "/student", "/security"];
  const isActivePath = (href: string) =>
    ROOT_PATHS.includes(href)
      ? pathname === href
      : pathname === href || (pathname.startsWith(href + "/") && href !== "/");

  const initial = userName.charAt(0).toUpperCase();
  const toggleCollapsed = () =>
    setDesktopCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("gatepass_sidebar_collapsed", String(next));
      document.cookie = `gatepass_sidebar_collapsed=${next}; path=/; max-age=31536000`;
      return next;
    });

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: floating glass panel (drawer on mobile) */}
      {navItems.length > 0 && (
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col glass transition-[transform,width] duration-300",
            "lg:static lg:translate-x-0 lg:my-3 lg:ml-3 lg:rounded-[28px] lg:shadow-card",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            desktopCollapsed ? "lg:w-[84px]" : "lg:w-64",
            "w-72 rounded-r-[28px]"
          )}
        >
          <div className="flex items-center justify-between px-4 pt-5 pb-4">
            <BrandMark compact={desktopCollapsed} roleLine={roleLine} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden rounded-full p-2 text-zinc-400 hover:bg-zinc-950 hover:text-zinc-200 transition-colors"
              aria-label={t("Close menu")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-label="Main">
            {navItems.map((item) => {
              const isActive = isActivePath(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavigation}
                  title={desktopCollapsed ? t(item.label) : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center rounded-2xl px-3 py-2.5 text-sm transition-colors duration-150 overflow-hidden",
                    isActive
                      ? "bg-zinc-900 text-zinc-100 font-medium shadow-card border border-zinc-800/80"
                      : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200 border border-transparent",
                    desktopCollapsed && "lg:justify-center lg:px-0"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px]",
                      isActive ? "bg-orange-500/10 text-orange-400" : "text-zinc-500 group-hover:text-zinc-300"
                    )}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      "flex flex-1 items-center justify-between min-w-0 ml-3 transition-[opacity,width,margin] duration-300",
                      desktopCollapsed && "lg:w-0 lg:flex-none lg:opacity-0 lg:ml-0"
                    )}
                  >
                    <span className="truncate">{t(item.label)}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 text-[10px] font-semibold text-white px-1.5 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Collapse toggle (desktop) + sign out */}
          <div className="px-3 pb-4 pt-2 space-y-1">
            <button
              onClick={toggleCollapsed}
              className={cn(
                "hidden lg:flex w-full items-center rounded-2xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200 transition-colors",
                desktopCollapsed && "justify-center px-0"
              )}
              aria-label={desktopCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
              title={desktopCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                {desktopCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
              </span>
              <span className={cn("ml-3 truncate", desktopCollapsed && "hidden")}>{t("Collapse")}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              aria-busy={signingOut}
              title={t("Sign out")}
              className={cn(
                "flex w-full items-center rounded-2xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-60 disabled:cursor-wait",
                desktopCollapsed && "lg:justify-center lg:px-0"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                {signingOut ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
              </span>
              <span className={cn("ml-3 truncate", desktopCollapsed && "lg:hidden")}>{signingOut ? t("Signing out…") : t("Sign out")}</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main */}
      <main className={cn("flex-1 flex flex-col min-w-0 max-w-full overflow-hidden relative", isMobileNavRole ? "pb-24 lg:pb-0" : "")}>
        {/* Top bar: glass */}
        <header className="sticky top-0 z-30 mx-3 mt-3 sm:mx-4 lg:mx-6 flex items-center gap-3 rounded-[22px] glass shadow-card px-3 sm:px-4 py-2.5 shrink-0">
          {navItems.length > 0 ? (
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-950 hover:text-zinc-200 transition-colors lg:hidden"
              aria-label={t("Open menu")}
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
          <div className={cn("min-w-0", navItems.length > 0 ? "lg:hidden" : "")}>
            <BrandMark roleLine={roleLine} />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {role === "SECURITY" && <LanguageToggle />}
            <div className="hidden md:flex flex-col items-end min-w-0 leading-tight">
              <span className="text-sm font-medium text-zinc-100 truncate max-w-[220px]">{userName}</span>
              <span className="text-[11px] text-zinc-500 truncate max-w-[220px]">{userEmail}</span>
            </div>
            <span
              className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400 text-sm font-semibold border border-orange-500/20"
              aria-hidden="true"
            >
              {initial}
            </span>
            {/* Sign out lives in the sidebar on desktop; keep it here for pages without a sidebar and on phones */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              aria-busy={signingOut}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-60 disabled:cursor-wait",
                navItems.length > 0 && "lg:hidden"
              )}
              title={t("Sign out")}
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{signingOut ? t("Signing out…") : t("Sign out")}</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-3 pt-5 pb-6 sm:px-4 lg:px-6 lg:pt-6 lg:pb-8">
          {children}
        </div>
      </main>

      {signingOut && <SigningOutOverlay />}

      {/* Mobile bottom navigation: floating glass bar */}
      {isMobileNavRole && navItems.length > 0 && (
        <nav
          className="lg:hidden fixed bottom-3 left-3 right-3 z-40 flex items-center justify-around rounded-[26px] glass shadow-card px-1 h-16"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Main"
        >
          {navItems.map((item) => {
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors",
                  isActive ? "text-orange-400" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors [&>svg]:h-5 [&>svg]:w-5",
                    isActive && "bg-orange-500/10"
                  )}
                >
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium tracking-tight truncate max-w-[64px] text-center">{t(item.label)}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-1 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 text-[9px] font-semibold text-white px-1">
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
  { label: "Registers", href: "/admin/registers", icon: <BookOpen className="h-5 w-5" /> },
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
  { label: "Scan Hostel Pass", href: "/warden/scan", icon: <ScanLine className="h-5 w-5" /> },
  { label: "Activity", href: "/warden/activity", icon: <History className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
  // Unimplemented:
  // { label: "Approval History", href: "/warden/history", icon: <History className="h-5 w-5" /> },
];

export const securityNavItems: NavItem[] = [
  { label: "Dashboard", href: "/security", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Scan QR", href: "/security/scan", icon: <ScanLine className="h-5 w-5" /> },
  { label: "Visitors", href: "/security/visitors", icon: <Users className="h-5 w-5" /> },
  { label: "Faculty", href: "/security/faculty", icon: <Briefcase className="h-5 w-5" /> },
  { label: "Gate Logs", href: "/security/log", icon: <History className="h-5 w-5" /> },
  { label: "Registers", href: "/security/registers", icon: <BookOpen className="h-5 w-5" /> },
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
  { label: "Registers", href: "/supervisor/registers", icon: <BookOpen className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <UserCog className="h-5 w-5" /> },
];