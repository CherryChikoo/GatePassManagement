"use client";
import { useT } from "@/components/providers/language-provider";
import { actionErrorMessage } from "@/lib/deployment";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { removeMyAvatar, updateMyAvatar, updateProfileSettings } from "@/server/actions/settings";
import { squareAvatar } from "@/lib/images/compress-photo";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";
import { GoBackButton } from "@/components/ui/go-back-button";
import {
  Camera,
  Loader2,
  Trash2,
  User,
  Mail,
  Lock,
  Save,
  Phone,
  Building2,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

interface Props {
  user: {
    name: string;
    email: string;
    role: string;
    phone?: string;
    department?: string;
    designation?: string;
    employeeId?: string;
  };
  /** Current profile photo (versioned URL), or null */
  avatarUrl?: string | null;
}

export function SettingsClient({ user, avatarUrl = null }: Props) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile photo: shown at once from the picked file while it uploads
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const shownPhoto = photoPreview ?? (photoRemoved ? null : avatarUrl);

  async function handlePhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSuccess(null);
    setPhotoBusy(true);
    try {
      const data = await squareAvatar(file);
      setPhotoPreview(data);
      const result = await updateMyAvatar(data);
      if (result?.error) {
        setPhotoPreview(null);
        setError(t(result.error));
      } else {
        setPhotoRemoved(false);
        setSuccess(t("Profile photo updated."));
        router.refresh();
      }
    } catch (err: any) {
      setPhotoPreview(null);
      setError(actionErrorMessage(err, t("Could not save the photo. Please try again.")));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handlePhotoRemove() {
    setError(null);
    setSuccess(null);
    setPhotoBusy(true);
    try {
      const result = await removeMyAvatar();
      if (result?.error) {
        setError(t(result.error));
      } else {
        setPhotoPreview(null);
        setPhotoRemoved(true);
        setSuccess(t("Profile photo removed."));
        router.refresh();
      }
    } catch (err: any) {
      setError(actionErrorMessage(err, t("Failed to update settings")));
    } finally {
      setPhotoBusy(false);
    }
  }

  // Controlled form state
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const department = user.department || "";
  const designation = user.designation || "";
  // Directors, Deans and HODs manage their own email and Employee ID (designation: Main Admin only)
  const selfManaged = ["DIRECTOR", "DEAN", "FACULTY_ADMIN"].includes(user.role);
  const [email, setEmail] = useState(user.email || "");
  const [employeeId, setEmployeeId] = useState(user.employeeId || "");
  const emailChanged = selfManaged && email.trim().toLowerCase() !== (user.email || "").toLowerCase();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");

  const isFacultyOrHod = ["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"].includes(user.role);
  // Security guards only keep their name and phone up to date here (login details are managed by the admin)
  const nameAndPhoneOnly = user.role === "SECURITY";
  // Students' passwords are set by their HOD, warden or the admin
  const canChangePassword = !nameAndPhoneOnly && user.role !== "STUDENT";

  const roleLabelMap: Record<string, { title: string; color: string }> = {
    DIRECTOR: {
      title: "Campus Director",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    DEAN: {
      title: "Dean",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    FACULTY_ADMIN: {
      title: "Head of Department (HOD)",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    FACULTY: {
      title: "Faculty Incharge",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    ADMIN: {
      title: "System Administrator",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    WARDEN: {
      title: "Hostel Warden",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    SECURITY: {
      title: "Security Staff",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    STUDENT: {
      title: "Student",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
  };

  const currentRoleInfo = roleLabelMap[user.role] || {
    title: user.role,
    color: "bg-zinc-950 text-zinc-300 border-zinc-800",
  };

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone);
    if (selfManaged) {
      formData.append("email", email.trim());
      formData.append("employeeId", employeeId.trim());
    }
    if (password || emailChanged) {
      formData.append("currentPassword", currentPassword);
      if (password) formData.append("password", password);
    }

    try {
      const result = await updateProfileSettings(formData);

      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(t("Profile settings updated."));
        setPassword("");
        setCurrentPassword("");
        // Refresh server components and sidebar to show updated profile details
        router.refresh();
      }
    } catch (err: any) {
      setError(actionErrorMessage(err, t("Failed to update settings")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopLoadingBar active={loading} />

      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        {user.role === "STUDENT" && <GoBackButton href="/student" />}
        <div>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">{t("Account Settings")}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {nameAndPhoneOnly
              ? t("Keep your name and phone number up to date.")
              : t("Manage your personal profile information, department details, and authentication credentials.")}
          </p>
        </div>

        {/* Who is signed in */}
        <div className="flex items-center gap-4 rounded-3xl border border-zinc-800/80 bg-zinc-900 p-5 sm:p-6 shadow-card">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={photoBusy}
            aria-label={t("Change photo")}
            className="group relative h-16 w-16 shrink-0 rounded-full disabled:cursor-wait"
          >
            {shownPhoto ? (
               
              <img src={shownPhoto} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-orange-500/30" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 text-2xl font-semibold text-orange-400">
                {(user.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-900 bg-orange-500 text-white shadow">
              {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </span>
          </button>
          <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={handlePhotoPicked} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium text-zinc-100">{user.name}</p>
            <p className="truncate text-sm text-zinc-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                disabled={photoBusy}
                className="text-xs font-medium text-orange-400 hover:text-orange-300 disabled:opacity-50"
              >
                {shownPhoto ? t("Change photo") : t("Add photo")}
              </button>
              {shownPhoto && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  disabled={photoBusy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("Remove photo")}
                </button>
              )}
            </div>
          </div>
          <span className={`hidden sm:inline-flex shrink-0 text-xs font-medium px-3 py-1 rounded-full border ${currentRoleInfo.color}`}>
            {t(currentRoleInfo.title)}
          </span>
        </div>

        <Card>
          <CardHeader className="border-b border-zinc-800/80 pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2 text-zinc-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
                <User className="h-4 w-4" />
              </span>
              {t("Profile Details")}
              <span className={`sm:hidden ml-auto text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${currentRoleInfo.color}`}>
                {t(currentRoleInfo.title)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <form onSubmit={handleUpdate} className="space-y-6">
              {error && (
                <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2.5 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{t(error)}</span>
                </div>
              )}
              {success && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{success}</span>
                </div>
              )}

              <div className="space-y-5">
                {/* Full Name */}
                <Input
                  label={t("Full Name")}
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("Enter full name")}
                  required
                  icon={<User className="h-4 w-4" />}
                />

                {/* Email Address (Read-only) — not shown to Security (name & phone only) */}
                {!nameAndPhoneOnly && (
                <div>
                  <Input
                    label={t("Email Address")}
                    name="email"
                    type="email"
                    value={selfManaged ? email : user.email}
                    onChange={selfManaged ? (e) => setEmail(e.target.value) : undefined}
                    disabled={!selfManaged}
                    required={selfManaged}
                    icon={<Mail className="h-4 w-4" />}
                  />
                  <p className="text-[11px] text-zinc-500 mt-1 ml-1">
                    {selfManaged
                      ? "This is also your login email. Changing it needs your current password (below)."
                      : t("Primary login email registered with campus authentication.")}
                  </p>
                </div>
                )}

                {/* Phone Number */}
                <Input
                  label={t("Phone Number")}
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("e.g. +91 9876543210")}
                  icon={<Phone className="h-4 w-4" />}
                />

                {/* Department & Designation (Visible for Faculty and HOD) */}
                {isFacultyOrHod && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <Input
                        label="Department"
                        name="department"
                        value={department || "Not assigned"}
                        disabled
                        icon={<Building2 className="h-4 w-4" />}
                      />
                      <p className="text-[11px] text-zinc-500 mt-1 ml-1">
                        Department is assigned by the administrator.
                      </p>
                    </div>
                    {/* Set by the Main Admin only (Admin → Users) */}
                    <div>
                      <Input
                        label={user.role === "DIRECTOR" ? "Title" : "Designation"}
                        name="designation"
                        value={designation || (user.role === "FACULTY" ? "Faculty Member" : "—")}
                        disabled
                        icon={<Briefcase className="h-4 w-4" />}
                      />
                      <p className="text-[11px] text-zinc-500 mt-1 ml-1">
                        Assigned by the administrator.
                      </p>
                    </div>
                    {selfManaged && (
                      <Input
                        label="Employee ID"
                        name="employeeId"
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        maxLength={50}
                        icon={<Briefcase className="h-4 w-4" />}
                      />
                    )}
                  </div>
                )}

                {user.role === "STUDENT" && (
                  <p className="flex items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950 px-4 py-3 text-xs text-zinc-500">
                    <Lock className="h-4 w-4 shrink-0" />
                    {t("To change your password, ask your HOD or warden.")}
                  </p>
                )}

                {canChangePassword && (
                <>
                <div className="h-px w-full bg-zinc-800/80 my-2"></div>

                {/* Change Password Section */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-100 mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950 text-zinc-400">
                      <Lock className="h-4 w-4" />
                    </span>
                    {t("Change Password")}
                  </h3>
                  <div className="space-y-4">
                    <Input
                      label={t("New Password (Optional)")}
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("Leave blank to keep current password")}
                      icon={<Lock className="h-4 w-4" />}
                    />
                    {(password || emailChanged) && (
                      <Input
                        label={t("Current Password")}
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={emailChanged && !password ? t("Required to change your email") : t("Required to change your password")}
                        required
                        icon={<Lock className="h-4 w-4" />}
                      />
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {t("A new password must be at least 8 characters. Your current password is required to change it.")}
                  </p>
                </div>
                </>
                )}
              </div>

              <div className="flex justify-end pt-5 border-t border-zinc-800/80 mt-6">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto sm:px-8"
                >
                  <Save className="h-4 w-4" />
                  {loading ? t("Saving Changes...") : t("Save Changes")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
