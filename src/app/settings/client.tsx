"use client";
import { actionErrorMessage } from "@/lib/deployment";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateProfileSettings } from "@/server/actions/settings";
import { TopLoadingBar } from "@/components/ui/top-loading-bar";
import {
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
}

export function SettingsClient({ user }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Controlled form state
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const department = user.department || "";
  const designation = user.designation || "";
  // Directors, Deans and HODs manage their own email, Employee ID and title
  const selfManaged = ["DIRECTOR", "DEAN", "FACULTY_ADMIN"].includes(user.role);
  const [email, setEmail] = useState(user.email || "");
  const [employeeId, setEmployeeId] = useState(user.employeeId || "");
  const [title, setTitle] = useState(() =>
    user.role === "DEAN"
      ? designation.replace(/^dean(\s+of)?\s*/i, "")
      : designation || (user.role === "DIRECTOR" ? "" : user.role === "FACULTY_ADMIN" ? "Head of Department" : "")
  );
  const emailChanged = selfManaged && email.trim().toLowerCase() !== (user.email || "").toLowerCase();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");

  const isFacultyOrHod = ["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"].includes(user.role);

  const roleLabelMap: Record<string, { title: string; color: string }> = {
    DIRECTOR: {
      title: "Campus Director",
      color: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    },
    DEAN: {
      title: "Dean",
      color: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    },
    FACULTY_ADMIN: {
      title: "Head of Department (HOD)",
      color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    },
    FACULTY: {
      title: "Faculty Incharge",
      color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    },
    ADMIN: {
      title: "System Administrator",
      color: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    },
    WARDEN: {
      title: "Hostel Warden",
      color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    },
    SECURITY: {
      title: "Security Staff",
      color: "bg-red-500/15 text-red-300 border-red-500/30",
    },
    STUDENT: {
      title: "Student",
      color: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    },
  };

  const currentRoleInfo = roleLabelMap[user.role] || {
    title: user.role,
    color: "bg-zinc-800 text-zinc-300 border-zinc-700",
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
      formData.append("title", title.trim());
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
        setSuccess("Profile settings updated.");
        setPassword("");
        setCurrentPassword("");
        // Refresh server components and sidebar to show updated profile details
        router.refresh();
      }
    } catch (err: any) {
      setError(actionErrorMessage(err, "Failed to update settings"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopLoadingBar active={loading} />

      <div className="max-w-3xl mx-auto space-y-8 pb-16">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-3">
            Account Settings
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${currentRoleInfo.color}`}
            >
              {currentRoleInfo.title}
            </span>
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage your personal profile information, department details, and authentication credentials.
          </p>
        </div>

        <Card className="border border-zinc-800 bg-zinc-900/60 shadow-none">
          <CardHeader className="border-b border-zinc-800/80 pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-100">
              <User className="h-4 w-4 text-orange-500" />
              Profile Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleUpdate} className="space-y-6">
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2.5 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{success}</span>
                </div>
              )}

              <div className="space-y-5">
                {/* Full Name */}
                <Input
                  label="Full Name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter full name"
                  required
                  icon={<User className="h-4 w-4" />}
                />

                {/* Email Address (Read-only) */}
                <div>
                  <Input
                    label="Email Address"
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
                      : "Primary login email registered with campus authentication."}
                  </p>
                </div>

                {/* Phone Number */}
                <Input
                  label="Phone Number"
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
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
                    {selfManaged && user.role === "DEAN" ? (
                      <div className="space-y-1">
                        <label htmlFor="settings-dean-of" className="block text-sm font-medium text-zinc-300">Dean of</label>
                        <div className="flex items-stretch rounded-xl border border-zinc-700/50 bg-zinc-900 focus-within:ring-2 focus-within:ring-orange-500/40">
                          <span className="flex items-center px-3.5 text-sm font-semibold text-zinc-400 border-r border-zinc-700/50 whitespace-nowrap">Dean of</span>
                          <input
                            id="settings-dean-of"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            maxLength={80}
                            placeholder="e.g. Placements, Internal Affairs"
                            className="h-12 w-full min-w-0 bg-transparent px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : selfManaged ? (
                      <Input
                        label={user.role === "DIRECTOR" ? "Title" : "Designation"}
                        name="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required={user.role === "DIRECTOR"}
                        maxLength={100}
                        placeholder={user.role === "DIRECTOR" ? "e.g. Managing Director" : "e.g. Head of Department"}
                        icon={<Briefcase className="h-4 w-4" />}
                      />
                    ) : (
                      <div>
                        <Input
                          label="Designation"
                          name="designation"
                          value={designation || "Faculty Member"}
                          disabled
                          icon={<Briefcase className="h-4 w-4" />}
                        />
                        <p className="text-[11px] text-zinc-500 mt-1 ml-1">
                          Designation is assigned administratively.
                        </p>
                      </div>
                    )}
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

                <div className="h-px w-full bg-zinc-800/80 my-6"></div>

                {/* Change Password Section */}
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-orange-500" /> Change Password
                  </h3>
                  <div className="space-y-4">
                    <Input
                      label="New Password (Optional)"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank to keep current password"
                      icon={<Lock className="h-4 w-4" />}
                    />
                    {(password || emailChanged) && (
                      <Input
                        label="Current Password"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={emailChanged && !password ? "Required to change your email" : "Required to change your password"}
                        required
                        icon={<Lock className="h-4 w-4" />}
                      />
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    A new password must be at least 8 characters. Your current password is required to change it.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-5 border-t border-zinc-800/80 mt-6">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto bg-orange-600 hover:bg-orange-500 text-white font-semibold shadow-none flex items-center justify-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {loading ? "Saving Changes..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
