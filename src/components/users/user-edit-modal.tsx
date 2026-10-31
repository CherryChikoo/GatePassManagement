"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, Select } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/deployment";
import { DEPARTMENTS, departmentLabel } from "@/lib/constants";
import { updateStudentDetails, updateUserDetails, resetUserPassword } from "@/server/actions/admin";
import { Part, PasswordField, DeanOfField } from "./form-part";
import { ParentFields } from "./parent-fields";
import { PARENT_FIELDS } from "@/lib/students/parents";

const ROLE_NAME: Record<string, string> = {
  STUDENT: "Student",
  FACULTY: "Faculty",
  FACULTY_ADMIN: "HOD",
  DIRECTOR: "Director",
  DEAN: "Dean",
  WARDEN: "Warden",
  SECURITY: "Security",
  SECURITY_SUPERVISOR: "Security Supervisor",
  ADMIN: "Admin",
};

const FACULTY_ROLES = ["FACULTY", "FACULTY_ADMIN", "DIRECTOR", "DEAN"];

/** The department list's code for a stored department ("Computer Science…" → "CSE"); "OTHER" when not in the list */
function departmentCode(stored: string): { code: string; custom: string } {
  const v = stored.trim().toLowerCase();
  if (!v) return { code: "CSE", custom: "" };
  const d = DEPARTMENTS.find(
    (x) => x.code.toLowerCase() === v || x.name.toLowerCase() === v || x.aliases.some((a) => a.toLowerCase() === v)
  );
  return d ? { code: d.code, custom: "" } : { code: "OTHER", custom: stored };
}

type Props = {
  /** The person being edited (profile with student / faculty / warden / securityStaff), or null when closed */
  user: any | null;
  onClose: () => void;
  /** Saved: the message to show ("Details updated.") */
  onSaved: (message: string) => void;
  faculty: any[];
  wardens: any[];
  gates: any[];
  /** Show the "New password" box (the server checks the same rules) */
  canSetPassword: boolean;
};

/**
 * The one Edit window for a person (Admin → Users, and the person's own page).
 * The details are split into numbered parts — Personal, Login, College / Job,
 * Stay, Approvals — each with a short hint, so the fields never blur together.
 */
export function UserEditModal({ user, onClose, onSaved, faculty, wardens, gates, canSetPassword }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={!!user}
      onClose={() => !busy && onClose()}
      title={user ? `Edit ${ROLE_NAME[user.role] ?? "User"} — ${user.name}` : "Edit"}
      className="max-w-2xl"
    >
      {user && (
        <EditForm
          key={user.id}
          user={user}
          faculty={faculty}
          wardens={wardens}
          gates={gates}
          canSetPassword={canSetPassword}
          busy={busy}
          setBusy={setBusy}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function EditForm({
  user,
  faculty,
  wardens,
  gates,
  canSetPassword,
  busy,
  setBusy,
  onCancel,
  onSaved,
}: {
  user: any;
  faculty: any[];
  wardens: any[];
  gates: any[];
  canSetPassword: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const isStudent = user.role === "STUDENT";
  const isFacultyType = FACULTY_ROLES.includes(user.role);
  const initialDept = departmentCode((isStudent ? user.student?.department : user.faculty?.department) || "");
  const [dept, setDept] = useState(initialDept.code);
  const customDept = initialDept.custom;
  const [studentType, setStudentType] = useState<string>(user.student?.studentType || "DAY_SCHOLAR");
  const [error, setError] = useState<string | null>(null);
  let part = 0;
  const next = () => ++part;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const get = (k: string) => (formData.get(k) as string | null) ?? "";
    const newPassword = get("newPassword");
    if (newPassword && newPassword.length < 8) {
      setError("The new password must be at least 8 characters");
      return;
    }
    const department = dept === "OTHER" ? customDept.trim() : dept;
    setBusy(true);
    setError(null);
    try {
      let res: any;
      if (isStudent) {
        if (!user.student?.id) {
          setError("Student record ID is missing");
          return;
        }
        res = await updateStudentDetails(user.student.id, {
          name: get("name"),
          email: get("email"),
          phone: get("phone"),
          studentRoll: get("studentRoll"),
          department,
          year: get("year") ? Number(get("year")) : null,
          semester: get("semester") ? Number(get("semester")) : null,
          section: get("section"),
          studentType: get("studentType"),
          hostelType: get("studentType") === "HOSTELLER" ? get("hostelType") || null : null,
          facultyId: get("facultyId") || null,
          wardenId: get("wardenId") || null,
          roomNumber: get("roomNumber") || null,
          hostelBlock: get("hostelBlock") || null,
          ...Object.fromEntries(PARENT_FIELDS.map((k) => [k, get(k)])),
        });
      } else {
        res = await updateUserDetails(user.id, {
          name: get("name"),
          email: get("email"),
          phone: get("phone"),
          employeeId: get("employeeId"),
          ...(isFacultyType ? { department } : {}),
          // Deans are saved as "Dean of <area>"
          designation:
            user.role === "DEAN" ? `Dean of ${get("deanOf").trim().replace(/^dean\s+of\s+/i, "")}` : get("designation"),
          hostelBlock: get("hostelBlock"),
          gateId: get("gateId"),
          ...(user.role === "SECURITY" ? { isHeadSecurity: formData.get("isHeadSecurity") === "on" } : {}),
        });
      }
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (newPassword) {
        const pw: any = await resetUserPassword(user.id, newPassword);
        if (pw?.error) {
          setError(`Details saved, but the password was not changed: ${pw.error}`);
          return;
        }
      }
      onSaved(newPassword ? "Details and password updated." : "Details updated.");
    } catch (err) {
      setError(actionErrorMessage(err, "Could not save the changes. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const departmentSelect = (
    <Select label="Department" name="department" value={dept} onChange={(e) => setDept(e.target.value)}>
      {DEPARTMENTS.map((d) => (
        <option key={d.code} value={d.code}>
          {departmentLabel(d)}
        </option>
      ))}
      {dept === "OTHER" && customDept && <option value="OTHER">{customDept} (current)</option>}
    </Select>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Part no={next()} title="Personal" hint="Who they are">
        <Input label="Full name" name="name" defaultValue={user.name} required />
        <Input label="Phone number" name="phone" defaultValue={user.phone || ""} placeholder="+91-9876543210" />
      </Part>

      <Part no={next()} title="Login" hint="How they sign in">
        <Input label="Email" name="email" type="email" defaultValue={user.email} required />
        {canSetPassword && (
          <PasswordField
            id="edit-new-password"
            name="newPassword"
            label="New password"
            placeholder="Empty = keep the current one"
            help="At least 8 characters. They are told it was changed."
          />
        )}
      </Part>

      {isStudent && (
        <>
          <Part no={next()} title="College" hint="Class details">
            <Input label="Roll number" name="studentRoll" defaultValue={user.student?.studentRoll || ""} required className="font-mono" />
            {departmentSelect}
            <Input label="Year" name="year" type="number" min={1} max={5} defaultValue={user.student?.year ?? ""} />
            <Input label="Semester" name="semester" type="number" min={1} max={12} defaultValue={user.student?.semester ?? ""} />
            <Input label="Section" name="section" defaultValue={user.student?.section ?? ""} />
          </Part>

          <Part no={next()} title="Stay" hint="Day scholar or hosteller">
            <Select label="Student type" name="studentType" value={studentType} onChange={(e) => setStudentType(e.target.value)}>
              <option value="DAY_SCHOLAR">Day Scholar</option>
              <option value="HOSTELLER">Hosteller</option>
            </Select>
            {studentType === "HOSTELLER" && (
              <>
                <Select label="Hostel" name="hostelType" defaultValue={user.student?.hostelType || ""}>
                  <option value="">-- Not set --</option>
                  <option value="BOYS">Boys Hostel</option>
                  <option value="LADIES">Ladies Hostel</option>
                </Select>
                <Input label="Hostel block" name="hostelBlock" defaultValue={user.student?.hostelBlock || ""} placeholder="e.g. Block A" />
                <Input label="Room number" name="roomNumber" defaultValue={user.student?.roomNumber || ""} placeholder="e.g. 204" />
              </>
            )}
          </Part>

          <Part no={next()} title="Parents" hint="Fills the Visitors Book at the gate">
            <ParentFields defaults={user.student ?? undefined} isNew={false} />
          </Part>

          <Part no={next()} title="Approvals" hint="Who approves their passes">
            <Select label="Faculty advisor" name="facultyId" defaultValue={user.student?.facultyId || ""}>
              <option value="">-- None --</option>
              {faculty.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.profile?.name} ({f.department || "No Dept"})
                </option>
              ))}
            </Select>
            {studentType === "HOSTELLER" && (
              <Select label="Warden" name="wardenId" defaultValue={user.student?.wardenId || ""}>
                <option value="">-- None --</option>
                {wardens.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.profile?.name} (Block {w.hostelBlock || "N/A"})
                  </option>
                ))}
              </Select>
            )}
          </Part>
        </>
      )}

      {isFacultyType && (
        <Part no={next()} title="Job" hint="Role in the college">
          <Input label="Employee ID" name="employeeId" defaultValue={user.faculty?.employeeId || ""} className="font-mono" />
          {departmentSelect}
          {user.role === "DEAN" ? (
            <DeanOfField id="edit-dean-of" defaultValue={(user.faculty?.designation || "").replace(/^dean(\s+of)?\s*/i, "")} />
          ) : (
            <Input
              label={user.role === "DIRECTOR" ? "Title *" : "Designation"}
              name="designation"
              required={user.role === "DIRECTOR"}
              maxLength={100}
              placeholder={user.role === "DIRECTOR" ? "e.g. Managing Director" : "e.g. Assistant Professor"}
              defaultValue={user.faculty?.designation || ""}
              wrapperClassName="sm:col-span-2"
            />
          )}
        </Part>
      )}

      {user.role === "WARDEN" && (
        <Part no={next()} title="Job" hint="Hostel duties">
          <Input label="Employee ID" name="employeeId" defaultValue={user.warden?.employeeId || ""} className="font-mono" />
          <Input label="Hostel block" name="hostelBlock" defaultValue={user.warden?.hostelBlock || ""} />
          <Input label="Designation" name="designation" maxLength={100} defaultValue={user.designation || ""} placeholder="e.g. Chief Warden" wrapperClassName="sm:col-span-2" />
        </Part>
      )}

      {user.role === "SECURITY" && (
        <Part no={next()} title="Job" hint="Gate duties">
          <Input label="Employee ID" name="employeeId" defaultValue={user.securityStaff?.employeeId || ""} className="font-mono" />
          <Select label="Assigned gate" name="gateId" defaultValue={user.securityStaff?.gate?.id || ""}>
            <option value="">-- None --</option>
            {gates?.map((g: any) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
          <Input label="Designation" name="designation" maxLength={100} defaultValue={user.designation || ""} placeholder="e.g. Gate In-charge" wrapperClassName="sm:col-span-2" />
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 cursor-pointer sm:col-span-2 hover:border-zinc-700 transition-colors">
            <input type="checkbox" name="isHeadSecurity" defaultChecked={!!user.securityStaff?.isHead} className="mt-0.5 h-4 w-4 accent-orange-500" />
            <span>
              <span className="block text-sm font-medium text-zinc-200">Head Security</span>
              <span className="block text-xs text-zinc-500">Can see and take the staff attendance register. Everything else is the same as Security.</span>
            </span>
          </label>
        </Part>
      )}

      {user.role === "SECURITY_SUPERVISOR" && (
        <Part no={next()} title="Job" hint="Shown under “Gate Pass”">
          <Input label="Designation" name="designation" maxLength={100} defaultValue={user.designation || ""} placeholder="e.g. Chief Security Officer" wrapperClassName="sm:col-span-2" />
        </Part>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-zinc-800">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          Save changes
        </Button>
      </div>
    </form>
  );
}
