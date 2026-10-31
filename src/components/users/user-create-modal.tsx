"use client";

import { useState } from "react";
import { AlertTriangle, UserPlus } from "lucide-react";
import { Modal, Select } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DepartmentSelect } from "@/components/ui/department-select";
import { actionErrorMessage } from "@/lib/deployment";
import { DEPARTMENTS, departmentLabel } from "@/lib/constants";
import { createUser } from "@/server/actions/admin";
import { Part, PasswordField, DeanOfField } from "./form-part";
import { ParentFields } from "./parent-fields";

/** Roles an Admin can create, with a line on what each one does here */
const ROLES: { value: string; label: string; hint: string }[] = [
  { value: "STUDENT", label: "Student", hint: "Asks for gate passes; the HOD (day scholar) or warden (hosteller) approves." },
  { value: "FACULTY", label: "Faculty", hint: "Asks for their own gate passes." },
  { value: "FACULTY_ADMIN", label: "HOD (Head of Department)", hint: "Approves passes for their department's students and faculty." },
  { value: "DEAN", label: "Dean", hint: "Approves faculty passes sent to the Dean." },
  { value: "DIRECTOR", label: "Director", hint: "Sees everything; approves nothing." },
  { value: "WARDEN", label: "Warden", hint: "Approves hostellers' outings and scans them at the hostel." },
  { value: "SECURITY", label: "Security", hint: "Scans passes at the gate and keeps the registers." },
  { value: "HEAD_SECURITY", label: "Head Security", hint: "Security, who also takes the staff attendance." },
  { value: "SECURITY_SUPERVISOR", label: "Security Supervisor", hint: "Sees the gate registers and logs; changes nothing." },
  { value: "ADMIN", label: "Admin", hint: "Full access: users, records and settings." },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Created: the message to show */
  onCreated: (message: string) => void;
  faculty: any[];
  wardens: any[];
  gates: any[];
};

/**
 * The Create window for a person. Same numbered parts as the Edit window
 * (user-edit-modal.tsx): first the role, then Personal, Login and the parts
 * that role needs (College / Stay / Approvals for students, Job for staff).
 */
export function UserCreateModal({ open, onClose, onCreated, faculty, wardens, gates }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Create New User" className="max-w-2xl">
      {/* A fresh, empty form every time the window opens */}
      {open && (
        <CreateForm
          faculty={faculty}
          wardens={wardens}
          gates={gates}
          busy={busy}
          setBusy={setBusy}
          onCancel={onClose}
          onCreated={onCreated}
        />
      )}
    </Modal>
  );
}

function CreateForm({
  faculty,
  wardens,
  gates,
  busy,
  setBusy,
  onCancel,
  onCreated,
}: {
  faculty: any[];
  wardens: any[];
  gates: any[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onCancel: () => void;
  onCreated: (message: string) => void;
}) {
  const [role, setRole] = useState("STUDENT");
  const [dept, setDept] = useState("CSE");
  const [studentType, setStudentType] = useState("DAY_SCHOLAR");
  const [error, setError] = useState<string | null>(null);
  // Suggested employee IDs for HOD / Dean / Director (can be changed)
  const [idSuffix] = useState(() => Date.now().toString().slice(-4));
  const roleInfo = ROLES.find((r) => r.value === role);
  let part = 0;
  const next = () => ++part;

  // Not a form action: React resets action forms after submit, which would
  // wipe everything typed when the server returns an error (e.g. email taken).
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res: any = await createUser(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onCreated("User created successfully!");
    } catch (err) {
      setError(actionErrorMessage(err, "Could not create the user. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const departmentSelect = (required: boolean) => (
    <Select label={required ? "Department *" : "Department"} name="department" required={required} value={dept} onChange={(e) => setDept(e.target.value)}>
      {DEPARTMENTS.map((d) => (
        <option key={d.code} value={d.code}>
          {departmentLabel(d)}
        </option>
      ))}
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

      <Part no={next()} title="Role" hint="What they do here">
        <div className="sm:col-span-2">
          <Select label="Role *" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          {roleInfo && <p className="mt-1.5 text-xs text-zinc-500">{roleInfo.hint}</p>}
          {role === "ADMIN" && (
            <p className="mt-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-600">
              An admin can do everything you can: create and disable users, edit records and change settings. Give this only to people you trust.
            </p>
          )}
        </div>
      </Part>

      <Part no={next()} title="Personal" hint="Who they are">
        <Input label="Full name *" name="name" required />
        <Input label="Phone number" name="phone" type="tel" placeholder="+91-9876543210" />
      </Part>

      <Part no={next()} title="Login" hint="How they sign in">
        <Input label="Email *" name="email" type="email" required />
        <PasswordField
          id="create-password"
          name="password"
          label="Password *"
          required
          placeholder="At least 8 characters"
          help="Give it to them; they can change it in Settings."
        />
      </Part>

      {role === "STUDENT" && (
        <>
          <Part no={next()} title="College" hint="Class details">
            <Input label="Roll number *" name="studentRoll" required className="font-mono" />
            {departmentSelect(false)}
            <Input label="Year" name="year" type="number" min={1} max={6} />
            <Input label="Semester" name="semester" type="number" min={1} max={12} />
            <Input label="Section" name="section" />
          </Part>

          <Part no={next()} title="Stay" hint="Day scholar or hosteller">
            <Select label="Student type" name="studentType" value={studentType} onChange={(e) => setStudentType(e.target.value)}>
              <option value="DAY_SCHOLAR">Day Scholar</option>
              <option value="HOSTELLER">Hosteller</option>
            </Select>
            {studentType === "HOSTELLER" && (
              <>
                <Select label="Hostel *" name="hostelType" required defaultValue="">
                  <option value="" disabled>
                    Select hostel
                  </option>
                  <option value="BOYS">Boys Hostel</option>
                  <option value="LADIES">Ladies Hostel</option>
                </Select>
                <Input label="Hostel block" name="hostelBlock" placeholder="e.g. Block A" />
                <Input label="Room number" name="roomNumber" placeholder="e.g. 204" />
              </>
            )}
          </Part>

          <Part no={next()} title="Parents" hint="Fills the Visitors Book at the gate">
            <ParentFields isNew />
          </Part>

          <Part no={next()} title="Approvals" hint="Who approves their passes">
            <Select label="Faculty advisor" name="assignedFacultyId" defaultValue="">
              <option value="">-- None --</option>
              {faculty.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.profile?.name} {f.department ? `(${f.department})` : ""}
                </option>
              ))}
            </Select>
            {studentType === "HOSTELLER" && (
              <Select label="Warden" name="assignedWardenId" defaultValue="">
                <option value="">-- None --</option>
                {wardens.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.profile?.name} {w.hostelBlock ? `(Block ${w.hostelBlock})` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Part>
        </>
      )}

      {(role === "FACULTY" || role === "FACULTY_ADMIN") && (
        <Part no={next()} title="Job" hint="Role in the college">
          <Input
            label="Employee ID *"
            name="employeeId"
            required
            className="font-mono"
            defaultValue={role === "FACULTY_ADMIN" ? `HOD-${idSuffix}` : undefined}
            key={role}
          />
          {departmentSelect(true)}
          <Input
            label="Designation"
            name="designation"
            maxLength={100}
            defaultValue={role === "FACULTY_ADMIN" ? "Head of Department" : "Assistant Professor"}
            key={`${role}-designation`}
            wrapperClassName="sm:col-span-2"
          />
        </Part>
      )}

      {(role === "DEAN" || role === "DIRECTOR") && (
        <Part no={next()} title="Job" hint="Role in the college">
          <Input
            label="Employee ID *"
            name="employeeId"
            required
            className="font-mono"
            defaultValue={`${role === "DEAN" ? "DEAN" : "DIR"}-${idSuffix}`}
            key={role}
          />
          <div className="min-w-0">
            <label htmlFor="create-top-dept" className="mb-1.5 block text-sm font-medium text-zinc-300">Department</label>
            <DepartmentSelect name="department" id="create-top-dept" defaultValue="All Departments" extraOptions={["All Departments"]} />
          </div>
          {role === "DEAN" ? (
            <DeanOfField id="create-dean-of" />
          ) : (
            <Input label="Title *" name="designation" required maxLength={100} placeholder="e.g. Managing Director" wrapperClassName="sm:col-span-2" />
          )}
        </Part>
      )}

      {role === "WARDEN" && (
        <Part no={next()} title="Job" hint="Hostel duties">
          <Input label="Employee ID *" name="employeeId" required className="font-mono" />
          <Input label="Hostel block" name="wardenHostelBlock" placeholder="e.g. Block A" />
          <Input label="Designation" name="designation" maxLength={100} placeholder="e.g. Chief Warden" wrapperClassName="sm:col-span-2" />
        </Part>
      )}

      {(role === "SECURITY" || role === "HEAD_SECURITY") && (
        <Part no={next()} title="Job" hint="Gate duties">
          <Input label="Employee ID *" name="employeeId" required className="font-mono" />
          <Select label="Assigned gate" name="assignedGateId" defaultValue="">
            <option value="">-- None --</option>
            {gates?.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Input label="Designation" name="designation" maxLength={100} placeholder="e.g. Gate In-charge" wrapperClassName="sm:col-span-2" />
        </Part>
      )}

      {(role === "SECURITY_SUPERVISOR" || role === "ADMIN") && (
        <Part no={next()} title="Job" hint="Shown under “Gate Pass”">
          <Input
            label="Designation"
            name="designation"
            maxLength={100}
            placeholder={role === "ADMIN" ? "e.g. System Administrator" : "e.g. Chief Security Officer"}
            wrapperClassName="sm:col-span-2"
          />
        </Part>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-zinc-800">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          <UserPlus className="h-4 w-4" />
          Create user
        </Button>
      </div>
    </form>
  );
}
