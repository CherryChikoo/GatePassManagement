/**
 * The 19 Security registers.
 *
 * "entry" registers are stored as immutable RegisterEntry rows and their forms
 * and server validation are generated from the field lists below.
 * "derived" registers are views over records the portal already keeps
 * (passes, gate movements, visitors), so nothing is entered twice.
 *
 * Rules for every entry register:
 * - Every input is optional; a record needs at least one detail.
 * - Dates are always today and times are the live time when saved — both are
 *   set by the server and cannot be typed in.
 * - Registers with In / Out start with the guard choosing In or Out; the other
 *   side is recorded later on the same record (live time again).
 * - Saved records can never be edited or deleted.
 *
 * Shared by the browser (forms, tables) and the server (validation), so this
 * file must stay free of server-only imports.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "phone"
  /** Always today (set by the server) */
  | "date"
  /** Always the live time when recorded (set by the server) */
  | "time"
  | "select"
  | "yesno"
  /** Picks a security staff member; the server stores their name and employee ID */
  | "staff";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  placeholder?: string;
  /** Group rows only: a time stamped later, when the row is marked out */
  completion?: boolean;
  /** Short helper text under the input */
  hint?: string;
};

export type GroupDef = {
  key: string;
  label: string;
  itemLabel: string;
  fields: FieldDef[];
  /** Maximum number of rows (null = no limit) */
  max: number | null;
};

export type Direction = "IN" | "OUT";

/** One side of an In / Out register: its time field and optional reading field. */
export type MovementSide = { label: string; timeKey: string; readingKey?: string };

export type MovementDef = {
  in: MovementSide;
  out: MovementSide;
  /** Which side a new record may start with */
  firstDirections: Direction[];
  /** A single In-or-Out event (nothing recorded later) */
  single?: boolean;
  /** Field that shows the chosen direction as "In" / "Out" */
  directionField?: string;
};

export type EntryRegister = {
  kind: "entry";
  key: RegisterKey;
  number: number;
  title: string;
  description: string;
  fields: FieldDef[];
  groups?: GroupDef[];
  movement?: MovementDef;
  /** Fixed values printed on the form (e.g. the "To" block of Form 19) */
  fixed?: { label: string; value: string }[];
  /** Fields shown in the list table (first is the headline) */
  listFields: string[];
};

export type DerivedRegister = {
  kind: "derived";
  key: RegisterKey;
  number: number;
  title: string;
  description: string;
};

export type RegisterDef = EntryRegister | DerivedRegister;

export const REGISTER_KEYS = [
  "FACULTY_BOOK",
  "VISITORS",
  "ADMISSION",
  "CAR_BOOK",
  "AUTO_BOOK",
  "DAILY_LABOUR",
  "LABOUR_CONTRACT",
  "SIROS_STOCK",
  "COLLEGE_STOCK",
  "SIROS_LABOUR_CONTRACT",
  "COLLEGE_DAILY",
  "BOYS_HOSTEL_OUTING",
  "LADIES_HOSTEL_OUTING",
  "SECURITY_DAILY",
  "SECURITY_ATTENDANCE",
  "HOME_OUTING_SUMMARY",
  "AUTO_IN_OUT",
  "KEYS",
  "RETURNABLE",
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

const SHIFTS = ["Morning", "Afternoon", "Night", "General"] as const;
const WORKER_TYPES = ["Peddamestri", "Chinnamestri", "Cooli"] as const;
const WORK_TYPES = ["Sanitary", "Plumbing", "Carpenter", "Electrical", "Masonry", "Painting", "Other"] as const;
const UNITS = ["Nos", "Kg", "Tons", "Litres", "Bags", "Boxes", "Metres", "Sq. ft", "Sets", "Other"] as const;
const BOTH: Direction[] = ["IN", "OUT"];

const labourFields: FieldDef[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "workerType", label: "Worker Type", type: "select", options: WORKER_TYPES },
  { key: "workerCount", label: "Worker Count on Arrival", type: "number" },
  { key: "workType", label: "Work Type", type: "select", options: WORK_TYPES },
  { key: "workDetails", label: "Work Details", type: "textarea" },
  { key: "workArea", label: "Work Area", type: "text" },
  { key: "mainWorker", label: "Main Worker Details", type: "text", placeholder: "Name, phone" },
  { key: "estate", label: "Estate", type: "text" },
  { key: "authorizedBy", label: "Building Work Authorized By", type: "text" },
];

const stockFields: FieldDef[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "itemName", label: "Item / Material Name", type: "text" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "unit", label: "Unit", type: "select", options: UNITS },
  { key: "direction", label: "Inward / Outward", type: "select", options: ["Inward", "Outward"] },
  { key: "supplierName", label: "Supplier Name", type: "text" },
  { key: "billNumber", label: "Bill Number", type: "text" },
  { key: "condition", label: "Condition", type: "select", options: ["Good", "Damaged", "Partially damaged"] },
  { key: "billAmount", label: "Bill Amount (₹)", type: "number" },
  { key: "timeCame", label: "Time Came", type: "time" },
  { key: "vehicleNumber", label: "Vehicle Number", type: "text" },
  { key: "billTakenBy", label: "Bill Taken By", type: "text" },
  { key: "inventoryStored", label: "Inventory Stored Details", type: "text", placeholder: "Where it is stored" },
  { key: "managerDetails", label: "Manager (name & designation)", type: "text" },
  { key: "purposeDestination", label: "Purpose / Destination", type: "text" },
  { key: "remarks", label: "Remarks", type: "textarea" },
];

const hostelOutingDescription =
  "Hostel outing passes approved in the portal, with the actual out and return times marked at the gate.";

export const REGISTERS: RegisterDef[] = [
  {
    kind: "derived",
    key: "FACULTY_BOOK",
    number: 1,
    title: "Faculty Book & Pass",
    description: "Approved faculty passes with the actual out-time and in-time marked by security.",
  },
  {
    kind: "derived",
    key: "VISITORS",
    number: 2,
    title: "Visitors Book & Pass",
    description: "Visitors registered at the gate, with in-time and out-time.",
  },
  {
    kind: "entry",
    key: "ADMISSION",
    number: 3,
    title: "Admission Book & Pass",
    description: "Admission enquiries and reporting visits by parents and guardians.",
    movement: { in: { label: "In", timeKey: "timeIn" }, out: { label: "Out", timeKey: "timeOut" }, firstDirections: BOTH },
    listFields: ["parentName", "programRequested", "admissionReporting", "timeIn", "timeOut"],
    fields: [
      { key: "visitDate", label: "Date of Visit", type: "date" },
      { key: "parentName", label: "Parent / Guardian Name", type: "text" },
      { key: "studentMobile", label: "Student Mobile Number", type: "phone" },
      { key: "parentMobile", label: "Parent / Guardian Mobile Number", type: "phone" },
      { key: "programRequested", label: "Program Requested", type: "text", placeholder: "e.g. B.Tech" },
      { key: "branch", label: "Branch / Specialization", type: "text" },
      { key: "admissionReporting", label: "Admission / Reporting", type: "select", options: ["Admission", "Reporting"] },
      { key: "referralType", label: "Direct / Any Staff Referral", type: "select", options: ["Direct", "Staff Referral"] },
      { key: "referralName", label: "Referral Name", type: "text" },
      {
        key: "heardFrom",
        label: "How Heard About RCE",
        type: "select",
        options: ["Friends / Relatives", "Alumni", "Newspaper", "Social Media", "Website", "Hoarding / Banner", "School / College visit", "Other"],
      },
      { key: "timeIn", label: "Time In", type: "time" },
      { key: "timeOut", label: "Time Out", type: "time" },
      { key: "purpose", label: "Purpose", type: "textarea" },
    ],
  },
  {
    kind: "entry",
    key: "CAR_BOOK",
    number: 4,
    title: "Car Book",
    description: "College cars going out and coming back, with odometer readings.",
    movement: {
      in: { label: "In", timeKey: "timeIn", readingKey: "inReading" },
      out: { label: "Out", timeKey: "timeOut", readingKey: "outReading" },
      firstDirections: BOTH,
    },
    listFields: ["vehicleNumber", "driverName", "usedBy", "timeOut", "timeIn"],
    fields: [
      { key: "driverName", label: "Driver Name", type: "text" },
      { key: "vehicleNumber", label: "Vehicle Number", type: "text" },
      { key: "usedBy", label: "Person / Department Using the Car", type: "text" },
      { key: "purpose", label: "Purpose", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "timeOut", label: "Time Out", type: "time" },
      { key: "outReading", label: "Out Reading (km)", type: "number" },
      { key: "timeIn", label: "Time In", type: "time" },
      { key: "inReading", label: "In Reading (km)", type: "number" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    kind: "entry",
    key: "AUTO_BOOK",
    number: 5,
    title: "Auto Book",
    description: "College autos going out on trips, with readings.",
    movement: {
      in: { label: "In", timeKey: "inTime", readingKey: "inReading" },
      out: { label: "Out", timeKey: "outTime", readingKey: "outReading" },
      firstDirections: BOTH,
    },
    listFields: ["autoNumber", "purpose", "outTime", "inTime"],
    fields: [
      { key: "autoNumber", label: "Auto Number / Vehicle Number", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "purpose", label: "Purpose / Trip Details", type: "text" },
      { key: "outTime", label: "Out Time", type: "time" },
      { key: "outReading", label: "Out Reading", type: "number" },
      { key: "inTime", label: "In Time", type: "time" },
      { key: "inReading", label: "In Reading", type: "number" },
    ],
  },
  {
    kind: "entry",
    key: "DAILY_LABOUR",
    number: 6,
    title: "College Daily Labour Book",
    description: "Daily labour arriving for college work.",
    listFields: ["workerType", "workerCount", "workType", "workArea"],
    fields: labourFields,
  },
  {
    kind: "entry",
    key: "LABOUR_CONTRACT",
    number: 7,
    title: "College Labour Contract Book",
    description: "Contract labour arriving for college work.",
    listFields: ["workerType", "workerCount", "workType", "workArea"],
    fields: [...labourFields, { key: "remarks", label: "Remarks", type: "textarea" }],
  },
  {
    kind: "entry",
    key: "SIROS_STOCK",
    number: 8,
    title: "Siros Venture Main Gate Stock Register",
    description: "Material coming in or going out at the Siros Venture main gate.",
    listFields: ["itemName", "direction", "quantity", "unit", "supplierName"],
    fields: stockFields,
  },
  {
    kind: "entry",
    key: "COLLEGE_STOCK",
    number: 9,
    title: "College Main Gate Stock Entry Register",
    description: "Material coming in or going out at the college main gate.",
    listFields: ["itemName", "direction", "quantity", "unit", "supplierName"],
    fields: stockFields,
  },
  {
    kind: "entry",
    key: "SIROS_LABOUR_CONTRACT",
    number: 10,
    title: "Siros Venture Daily Labour & Contract Book",
    description: "Contractors and every worker under them, with in and out times.",
    movement: {
      in: { label: "In", timeKey: "contractorIn" },
      out: { label: "Out", timeKey: "contractorOut" },
      firstDirections: ["IN"],
    },
    listFields: ["contractorName", "totalWorkers", "contractorIn", "contractorOut"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "contractorName", label: "Contractor Name", type: "text" },
      { key: "workDetails", label: "Work Details", type: "textarea" },
      { key: "phone", label: "Phone Number", type: "phone" },
      { key: "totalWorkers", label: "Total Workers Under Contractor", type: "number" },
      { key: "contractorIn", label: "Contractor In-Time", type: "time" },
      { key: "contractorOut", label: "Contractor Out-Time", type: "time" },
      { key: "supervisorDetails", label: "Supervisor (name & details)", type: "text" },
      { key: "civilEngineerDetails", label: "Civil Engineer (name & details)", type: "text" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
    groups: [
      {
        key: "workers",
        label: "Workers",
        itemLabel: "Worker",
        max: null,
        fields: [
          { key: "name", label: "Worker Name", type: "text" },
          { key: "gender", label: "Gender", type: "select", options: ["Male", "Female"] },
          { key: "inTime", label: "In-Time", type: "time" },
          { key: "outTime", label: "Out-Time", type: "time", completion: true },
          { key: "assignedBy", label: "Work Assigned By", type: "select", options: ["Supervisor", "Engineer"] },
        ],
      },
    ],
  },
  {
    kind: "entry",
    key: "COLLEGE_DAILY",
    number: 11,
    title: "College Daily Book",
    description: "General daily in / out entries.",
    movement: {
      in: { label: "In", timeKey: "time" },
      out: { label: "Out", timeKey: "time" },
      firstDirections: BOTH,
      single: true,
      directionField: "inOut",
    },
    listFields: ["whoReferred", "purpose", "inOut", "time"],
    fields: [
      { key: "whoReferred", label: "Who Referred", type: "text", hint: "Person(s) or work the visit is for" },
      { key: "purpose", label: "Purpose", type: "text" },
      { key: "inOut", label: "In / Out", type: "select", options: ["In", "Out"] },
      { key: "time", label: "Time", type: "time" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    kind: "derived",
    key: "BOYS_HOSTEL_OUTING",
    number: 12,
    title: "Boys Hostel Student Outing Book & Pass",
    description: hostelOutingDescription,
  },
  {
    kind: "derived",
    key: "LADIES_HOSTEL_OUTING",
    number: 13,
    title: "Ladies Hostel Student Outing Book & Pass",
    description: hostelOutingDescription,
  },
  {
    kind: "entry",
    key: "SECURITY_DAILY",
    number: 14,
    title: "Security Daily Book",
    description: "Security duty for each shift.",
    movement: {
      in: { label: "Duty start", timeKey: "dutyStart" },
      out: { label: "Duty end", timeKey: "dutyEnd" },
      firstDirections: ["IN"],
    },
    listFields: ["staff", "shift", "dutyStart", "dutyEnd"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "shift", label: "Shift", type: "select", options: SHIFTS },
      { key: "staff", label: "Security Staff", type: "staff" },
      { key: "dutyStart", label: "Duty Start Time", type: "time" },
      { key: "dutyEnd", label: "Duty End Time", type: "time" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    kind: "entry",
    key: "SECURITY_ATTENDANCE",
    number: 15,
    title: "Security Attendance Register Book",
    description: "Attendance of security staff.",
    movement: { in: { label: "In", timeKey: "inTime" }, out: { label: "Out", timeKey: "outTime" }, firstDirections: ["IN"] },
    listFields: ["staff", "shift", "attendanceStatus", "inTime", "outTime"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "staff", label: "Security Staff (name & employee ID)", type: "staff" },
      { key: "rank", label: "Rank", type: "text", placeholder: "e.g. Guard, Head Guard" },
      { key: "shift", label: "Shift", type: "select", options: SHIFTS },
      { key: "attendanceStatus", label: "Attendance Status", type: "select", options: ["Present", "Absent", "Late", "Half Day", "On Leave"] },
      { key: "inTime", label: "In-Time", type: "time" },
      { key: "outTime", label: "Out-Time", type: "time" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    kind: "derived",
    key: "HOME_OUTING_SUMMARY",
    number: 16,
    title: "Boys & Ladies Hostel Home Outing Passbook",
    description: "Date-wise totals of hostel home outing passes, with faculty pass counts.",
  },
  {
    kind: "entry",
    key: "AUTO_IN_OUT",
    number: 17,
    title: "Auto In & Out Book",
    description: "Outside autos entering and leaving the campus.",
    movement: { in: { label: "In", timeKey: "inTime" }, out: { label: "Out", timeKey: "outTime" }, firstDirections: BOTH },
    listFields: ["autoNumber", "driverName", "inTime", "outTime"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "autoNumber", label: "Auto Number / Vehicle Number", type: "text" },
      { key: "driverName", label: "Driver Name", type: "text" },
      { key: "inTime", label: "In-Time", type: "time" },
      { key: "outTime", label: "Out-Time", type: "time" },
      { key: "purposeRemarks", label: "Purpose / Remarks", type: "textarea" },
    ],
  },
  {
    kind: "entry",
    key: "KEYS",
    number: 18,
    title: "College Purpose & Keys Book",
    description: "Keys handed out and returned.",
    movement: {
      in: { label: "Key returned", timeKey: "keyReturnedTime" },
      out: { label: "Key taken", timeKey: "keyTakenTime" },
      firstDirections: BOTH,
    },
    listFields: ["keyName", "personName", "department", "keyTakenTime", "keyReturnedTime"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "personName", label: "Person Name", type: "text" },
      { key: "phone", label: "Phone Number", type: "phone" },
      { key: "department", label: "Department", type: "text" },
      { key: "keyName", label: "Key Name / Key Number", type: "text" },
      { key: "purpose", label: "Purpose", type: "text" },
      { key: "keyGivenBy", label: "Key Given By", type: "text" },
      { key: "keyTakenBy", label: "Key Taken By", type: "text" },
      { key: "keyTakenTime", label: "Key Taken Time", type: "time" },
      { key: "keyReturnedTime", label: "Key Returned Time", type: "time" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    kind: "entry",
    key: "RETURNABLE",
    number: 19,
    title: "Returnable & Non-Returnable Book",
    description: "Material taken out by faculty or staff, returnable or not.",
    movement: { in: { label: "In", timeKey: "inTime" }, out: { label: "Out", timeKey: "outTime" }, firstDirections: BOTH },
    listFields: ["fromName", "itemType", "purpose", "outTime", "inTime"],
    fixed: [
      { label: "To (Recipient)", value: "Estate Manager" },
      { label: "Institution", value: "Ramachandra College" },
    ],
    fields: [
      { key: "fromName", label: "From — Name of Faculty / Staff", type: "text" },
      { key: "fromDesignation", label: "From — Designation", type: "text" },
      { key: "fromDepartment", label: "From — Department", type: "text" },
      { key: "allowingDesignation", label: "Allowing — Designation", type: "text" },
      { key: "allowingOrganization", label: "Allowing — Belonging Organization", type: "text" },
      { key: "allowingCity", label: "Allowing — City", type: "text" },
      { key: "purpose", label: "Taking Out Purpose", type: "text" },
      { key: "itemType", label: "Item Type", type: "select", options: ["Returnable", "Non-Returnable"] },
      { key: "phone", label: "Phone Number", type: "phone" },
      { key: "outTime", label: "Out-Time", type: "time" },
      { key: "inTime", label: "In-Time", type: "time" },
    ],
    groups: [
      {
        key: "items",
        label: "Material Details",
        itemLabel: "Item",
        max: 5,
        fields: [
          { key: "description", label: "Name and Description", type: "text" },
          { key: "quantity", label: "Quantity", type: "number" },
          { key: "remarks", label: "Remarks", type: "text" },
        ],
      },
    ],
  },
];

export const REGISTER_BY_KEY: Record<RegisterKey, RegisterDef> = Object.fromEntries(
  REGISTERS.map((r) => [r.key, r])
) as Record<RegisterKey, RegisterDef>;

/** URL slug ↔ key ("CAR_BOOK" ↔ "car-book") */
export function registerSlug(key: RegisterKey): string {
  return key.toLowerCase().replace(/_/g, "-");
}

export function registerFromSlug(slug: string): RegisterDef | null {
  const key = slug.toUpperCase().replace(/-/g, "_");
  return (REGISTER_BY_KEY as Record<string, RegisterDef>)[key] ?? null;
}

export function isEntryRegister(def: RegisterDef): def is EntryRegister {
  return def.kind === "entry";
}

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/** The side a record started with (older records: inferred from which time is set). */
export function firstDirection(def: EntryRegister, data: Record<string, unknown>): Direction | null {
  const m = def.movement;
  if (!m) return null;
  if (data.direction === "IN" || data.direction === "OUT") return data.direction;
  if (!isBlank(data[m.out.timeKey]) && isBlank(data[m.in.timeKey])) return "OUT";
  if (!isBlank(data[m.in.timeKey])) return "IN";
  return null;
}

/**
 * What can still be recorded on a saved record: the other side of an In / Out
 * register, and group rows (e.g. workers) not yet marked out.
 */
export function pendingActions(def: EntryRegister, data: Record<string, unknown>) {
  const m = def.movement;
  let next: (MovementSide & { direction: Direction }) | null = null;
  if (m && !m.single) {
    const first = firstDirection(def, data);
    if (first) {
      const other: Direction = first === "IN" ? "OUT" : "IN";
      const side = other === "IN" ? m.in : m.out;
      if (isBlank(data[side.timeKey])) next = { ...side, direction: other };
    }
  }
  const groups = (def.groups ?? [])
    .map((g) => {
      const f = g.fields.find((x) => x.completion);
      const rows = Array.isArray(data[g.key]) ? (data[g.key] as Record<string, unknown>[]) : [];
      return { group: g, field: f, open: f ? rows.map((r, i) => (isBlank(r[f.key]) ? i : -1)).filter((i) => i >= 0) : [] };
    })
    .filter((x) => x.field && x.open.length > 0);
  return { next, groups, any: !!next || groups.length > 0 };
}

/** Faculty Book (Form 1) request types */
export const FACULTY_REQUEST_TYPES = [
  { value: "ONE_HOUR", label: "1-Hour Permission" },
  { value: "HALF_DAY_CL", label: "Half-Day CL" },
  { value: "FULL_DAY_CL", label: "Full-Day CL" },
  { value: "MULTI_DAY_CL", label: "Multiple-Day CL" },
  { value: "OD", label: "OD" },
] as const;

export type FacultyRequestType = (typeof FACULTY_REQUEST_TYPES)[number]["value"];

export function facultyRequestTypeLabel(value?: string | null): string {
  return FACULTY_REQUEST_TYPES.find((t) => t.value === value)?.label ?? "";
}

/** Number of days for a faculty request (inclusive date range for multi-day types). */
export function facultyRequestDays(type: string, startDate: string, endDate: string): number | null {
  if (type === "ONE_HOUR") return 0;
  if (type === "HALF_DAY_CL") return 0.5;
  if (type === "FULL_DAY_CL") return 1;
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.round((e - s) / 86_400_000) + 1;
}
