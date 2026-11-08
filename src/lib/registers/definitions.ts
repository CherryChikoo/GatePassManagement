/**
 * The 19 Security registers.
 *
 * "entry" registers are stored as immutable RegisterEntry rows and their forms
 * and server validation are generated from the field lists below.
 * "derived" registers are views over records the portal already keeps
 * (passes, gate movements, visitors), so nothing is entered twice.
 *
 * Rules for every entry register:
 * - The important details (names, numbers, the item or key) are mandatory;
 *   every other input is optional.
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
  | "staff"
  /** College department: dropdown, or "Other" to type a name */
  | "department"
  /** Photo taken with the device camera (stored in Supabase Storage) */
  | "photo"
  /** Faculty / staff picked from the portal's people (or typed when not listed); stored as text */
  | "person"
  /**
   * Keys Book "Key taken by": Faculty / Staff or Student first, then the name
   * (faculty list) or roll number / name (students), with instant suggestions.
   * Stored as text; the picked person's ID goes in "holderId" and the server
   * adds their phone number and details (see createRegisterEntry).
   */
  | "keyHolder";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  /** Choices of a "select"; for "yesno": the two button words [yes, no] (default Yes / No) */
  options?: readonly string[];
  placeholder?: string;
  /** Group rows only: a time stamped later, when the row is marked out */
  completion?: boolean;
  /** Short helper text under the input */
  hint?: string;
  /** Choice lists: add "Other", which opens a box to type a value */
  allowOther?: boolean;
  /** "person" fields: fill these fields from the picked person (e.g. their designation) */
  fills?: { designation?: string; department?: string };
  /**
   * Shown as its own section on a saved record, with a button to change it
   * later (Yes / No status such as "Payment completed", or Remarks). Every
   * change is kept in the record history. Only "yesno", "text" and "textarea".
   */
  updatable?: boolean;
  /** updatable: can't be changed any more once this Yes / No field is Yes (e.g. "Bill taken by" once the bill is marked taken) */
  lockedBy?: string;
  /**
   * Plain text box with a "Select" button beside it that lists known values
   * (drivers, cars, autos, faculty: getVehicleOptions in
   * src/server/actions/registers.ts); typing is always free. Stored as ordinary text.
   */
  combo?: "driver" | "vehicle" | "carName" | "purpose" | "faculty" | "sirosContractor" | "options" | "suggest";
  /** combo "suggest": shown first, before what was typed in earlier entries (e.g. A Block, B Block, C Block) */
  suggestFirst?: string[];
  /** combo "suggest": picking a past value also fills these boxes from that earlier entry (e.g. designation, department) */
  suggestFills?: string[];
  /** "vehicle" combos: the field that also gets the picked vehicle's name (e.g. vehicleName) */
  comboFills?: string;
  /** Kept in the record but not shown on the new-entry form (old records still show it) */
  formHidden?: boolean;
  /** Optional, but shown up front on the new-entry form (not under "More details") */
  upFront?: boolean;
  /** Shown on the form only when this Yes / No button is on (e.g. Supplier name after "Supplier known") */
  showWhen?: string;
  /** With showWhen: must be filled while it is shown */
  requiredWhenShown?: boolean;
  /** Hidden on the form (and not needed) while this Yes / No button is on (e.g. bill details after "No bill") */
  hideWhen?: string;
  /** With updatable: added later on the saved record, only when this Yes / No was on (e.g. the bill photo after "No bill") */
  addLaterWhen?: string;
  /** With addLaterWhen: the record's status words [added, not added yet] (e.g. "Bill updated" / "No bill attached") */
  laterStatus?: [string, string];
  /** "photo": several photos can be taken (up to this many); saved as a list */
  maxPhotos?: number;
  /** Form: the box takes the whole row (long labels / long answers) */
  wide?: boolean;
  /** Form: fields with the same section are drawn together in one bordered box with this heading */
  section?: string;
  /** Required while this Yes / No button is on (e.g. the stock photo after "No bill") */
  requiredWhen?: string;
  /** A Yes / No button that, when on at save, also sets this Yes / No field (e.g. "Bill taken now" → Bill taken) */
  setsFlag?: string;
  /** One-tap answers shown as buttons under the box (e.g. "Self" for a referral) */
  quickValues?: string[];
  /** List columns: the older field to show when this one is empty (old records) */
  listFallback?: string;
  /** Short "select": the choices show as big buttons; "yesno": one toggle button (the yes word) */
  buttons?: boolean;
};

/** Field types that can be updatable (changed later from the record) */
export const UPDATABLE_TYPES: readonly FieldType[] = ["yesno", "text", "textarea", "photo"];

/** Words for a Yes / No field's two answers, e.g. ["Paid", "Not paid"] (default Yes / No). */
export function yesNoWords(f: Pick<FieldDef, "options">): [string, string] {
  return [f.options?.[0] || "Yes", f.options?.[1] || "No"];
}

/** Fields of a register that can be changed later from a saved record. */
export function updatableFields(def: { fields: FieldDef[] }): FieldDef[] {
  return def.fields.filter((f) => f.updatable && UPDATABLE_TYPES.includes(f.type));
}

export type GroupDef = {
  key: string;
  label: string;
  itemLabel: string;
  fields: FieldDef[];
  /** Maximum number of rows (null = no limit) */
  max: number | null;
  /** Fields that must be filled in every row that is added */
  required?: string[];
  /**
   * Rows are picked from registered people instead of typed (Siros Venture
   * coolies: "+ Add coolie" list, by name or number; new ones registered with a photo)
   */
  picker?: "sirosCoolie" | "typedRows" | "itemsPopup";
  /** At least this many rows (e.g. one worker) */
  minRows?: number;
};

/** Is a field required for this entry? (the required list, minus the "requiredUnless" waiver) */
export function isFieldRequired(
  def: Pick<EntryRegister, "required" | "requiredUnless"> & { fields?: FieldDef[] },
  key: string,
  values: Record<string, unknown>
): boolean {
  const on = (v: unknown) => v === true || v === "yes" || v === "true";
  const field = def.fields?.find((x) => x.key === key);
  if (field?.hideWhen && on(values[field.hideWhen])) return false;
  if (field?.requiredWhen && on(values[field.requiredWhen])) return true;
  if (!def.required.includes(key)) return false;
  const w = def.requiredUnless;
  if (w && w.fields.includes(key)) {
    const v = values[w.flag];
    if (v === true || v === "yes" || v === "true") return false;
  }
  return true;
}

export type Direction = "IN" | "OUT";

/** One side of an In / Out register: its time field and optional reading field. */
export type MovementSide = { label: string; timeKey: string; readingKey?: string };

export type MovementDef = {
  in: MovementSide;
  out: MovementSide;
  /** Asked every time it goes Out (saved in this field), e.g. the auto's reason for going out */
  outReasonKey?: string;
  /** Saved as one side only when this field has this value (e.g. Non-Returnable: out, never back) */
  oneWayWhen?: { field: string; value: string };
  /** Which side a new record may start with */
  firstDirections: Direction[];
  /** A single In-or-Out event (nothing recorded later) */
  single?: boolean;
  /**
   * Always starts with the first of firstDirections, and the other side is
   * always recorded later: the new-entry form shows no In / Out choice and no
   * "In only" option (e.g. Admission Book: visitors come in, then go out).
   */
  fixedStart?: boolean;
  /** The side the new-entry form starts on (the guard may switch when firstDirections has both) */
  startWith?: Direction;
  /** No "Out only" / "In only" choice: the other side is always recorded later on the same record */
  noOneWay?: boolean;
  /** The new-entry form opens with neither side chosen (no default, no "last used"): the guard taps In or Out */
  chooseEachTime?: boolean;
  /** Out asks how many of each type in this list are leaving (e.g. College Daily Labour: "workers") */
  exitCounts?: string;
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
  /** The important details that must be filled in; every other input is optional */
  required: string[];
  /** Groups of fields where at least one of each group must be filled (e.g. person using the car OR purpose) */
  requiredAny?: string[][];
  /** New-entry form: required fields get a subtle highlight, and every shown field is up front (no "More details") */
  highlightRequired?: boolean;
  /** The bill photo (this field) is read by Gemini and fills the empty bill boxes (bill number, amount, items…) */
  readsBill?: string;
  /** Listed fields are required unless the yes / no flag field is on (e.g. no bill: no bill photo or amount) */
  requiredUnless?: { fields: string[]; flag: string };
  /** Fixed values printed on the form (e.g. the "To" block of Form 19) */
  /** Shown above the form: fixed details, or a one-line note (note: true) */
  fixed?: { label: string; value: string; note?: boolean }[];
  /**
   * "Meeting (faculty / staff)" picker: the person met gets a meeting code
   * (src/lib/visits/passes.ts) and the Out side needs it. The fields name
   * which of this register's fields hold the visitor's name / phone / purpose.
   */
  visitHost?: { visitorField: string; phoneField?: string; purposeField?: string };
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
  "STUDENT_BOOK",
  "VISITORS",
  "ADMISSION",
  "CAR_BOOK",
  "AUTO_BOOK",
  "DAILY_LABOUR",
  "LABOUR_CONTRACT",
  "COOLI_BOOK",
  "SIROS_STOCK",
  "COLLEGE_STOCK",
  "SIROS_LABOUR_CONTRACT",
  "SIROS_DAILY_LABOUR",
  "COLLEGE_DAILY",
  "BOYS_HOSTEL_OUTING",
  "LADIES_HOSTEL_OUTING",
  "SECURITY_DAILY",
  "SECURITY_ATTENDANCE",
  "HOME_OUTING_SUMMARY",
  "AUTO_IN_OUT",
  "KEYS",
  "RETURNABLE",
  "WORK_VEHICLES",
  /** Drivers / cars / autos registered at the Car Book and Auto Book (never listed as a register) */
  "VEHICLE_FLEET",
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

/** Books the Estate Manager checks and marks "Verified" (stock, returnable, labour, work vehicles) */
/**
 * Besides Security, these logins may add a photo that is "added later" on a
 * saved Estate Manager book record (e.g. the bill photos after "No bill").
 * A Civil Engineer login, when it is made, goes here too.
 */
export const ADD_LATER_ROLES: readonly string[] = ["ESTATE_MANAGER"];

export const ESTATE_BOOKS: readonly string[] = [
  "SIROS_STOCK",
  "COLLEGE_STOCK",
  "RETURNABLE",
  "DAILY_LABOUR",
  "LABOUR_CONTRACT",
  "SIROS_DAILY_LABOUR",
  "WORK_VEHICLES",
];

/** Duty shifts; "Other" lets the guard type any other shift */
const SHIFTS = ["A", "B", "C"] as const;
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
  { key: "workArea", label: "Work Location", type: "text" },
  { key: "mainWorker", label: "Main Worker Details", type: "text", placeholder: "Name, phone" },
  { key: "estate", label: "Estate", type: "text" },
  { key: "authorizedBy", label: "Building Work Authorized By", type: "person" },
];

const hostelOutingDescription =
  "Hostel outing passes approved in the portal, with the actual out and return times marked at the gate.";

/** Same inputs for the Siros Venture Daily Labour Book and Labour Contract Book */
const SIROS_LABOUR_INPUTS: Pick<EntryRegister, "required" | "movement" | "listFields" | "fields" | "groups" | "highlightRequired"> = {
  required: ["contractorName", "workDetails"],
  highlightRequired: true,
  movement: {
    in: { label: "In", timeKey: "contractorIn" },
    out: { label: "Out", timeKey: "contractorOut" },
    firstDirections: ["IN"],
    // Always "In now, Out later": the same record is marked Out from the list
    fixedStart: true,
  },
  listFields: ["contractorName", "totalWorkers", "contractorIn", "contractorOut"],
  fields: [
    { key: "date", label: "Date", type: "date" },
    // Picked from registered contractors (type the name or number); fills their phone
    { key: "contractorName", label: "Contractor", type: "text", combo: "sirosContractor", comboFills: "phone" },
    { key: "phone", label: "Phone Number", type: "phone" },
    { key: "workDetails", label: "Details of Work", type: "textarea" },
    // Counted from the coolies added (set on save)
    { key: "totalWorkers", label: "Total Coolies", type: "number", formHidden: true },
    { key: "contractorIn", label: "In-Time", type: "time" },
    { key: "contractorOut", label: "Out-Time", type: "time" },
    // Older records: kept and shown, not on the new form
    { key: "supervisorDetails", label: "Supervisor (name & details)", type: "text", formHidden: true },
    { key: "civilEngineerDetails", label: "Civil Engineer (name & details)", type: "text", formHidden: true },
    { key: "remarks", label: "Remarks", type: "textarea", formHidden: true },
  ],
  groups: [
    {
      key: "workers",
      label: "Coolies",
      itemLabel: "Coolie",
      max: null,
      required: ["name"],
      picker: "sirosCoolie",
      fields: [
        { key: "no", label: "Coolie No.", type: "text" },
        { key: "name", label: "Coolie Name", type: "text" },
        { key: "gender", label: "Gender", type: "select", options: ["Male", "Female"] },
        { key: "inTime", label: "In-Time", type: "time" },
        { key: "outTime", label: "Out-Time", type: "time", completion: true },
        { key: "assignedBy", label: "Work Assigned By", type: "select", options: ["Supervisor", "Engineer"] },
      ],
    },
  ],
};

/** Both Siros Venture labour books (same inputs and rules) */
/** Registers whose saved records Security may edit (every edit is kept as a correction) */
export const SECURITY_EDITABLE_REGISTERS: readonly string[] = ["COOLI_BOOK"];

export function isSirosLabour(key: string): boolean {
  return key === "SIROS_LABOUR_CONTRACT" || key === "SIROS_DAILY_LABOUR";
}

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
    key: "STUDENT_BOOK",
    number: 20,
    title: "Students Book & Pass",
    description: "Approved day-scholar gate passes with the actual out-time and in-time scanned at the gate.",
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
    // Up front: student, parent, referral (+ its department), reason, how they heard; the rest under "More details"
    required: ["studentName", "parentName", "purpose"],
    movement: { in: { label: "In", timeKey: "timeIn" }, out: { label: "Out", timeKey: "timeOut" }, firstDirections: ["IN"], fixedStart: true },
    listFields: ["studentName", "parentName", "purpose", "timeIn", "timeOut"],
    visitHost: { visitorField: "parentName", phoneField: "parentMobile", purposeField: "purpose" },
    fields: [
      { key: "studentName", label: "Student Name", type: "text" },
      { key: "parentName", label: "Parent / Guardian Name", type: "text" },
      // A staff member picked from the suggestions fills the department; any name can be typed
      { key: "referralName", label: "Referral (staff or anyone)", type: "person", fills: { department: "department" }, upFront: true, quickValues: ["Self"] },
      { key: "department", label: "Department", type: "department", upFront: true },
      { key: "purpose", label: "Reason / Purpose", type: "textarea" },
      {
        key: "heardFrom",
        label: "How Heard About RCE",
        type: "select",
        options: ["Friends / Relatives", "Alumni", "Newspaper", "Social Media", "Website", "Hoarding / Banner", "School / College visit", "Other"],
        upFront: true,
      },
      // More details
      { key: "parentMobile", label: "Parent / Guardian Mobile Number", type: "phone" },
      { key: "studentMobile", label: "Student Mobile Number", type: "phone" },
      { key: "programRequested", label: "Program Requested", type: "text", placeholder: "e.g. B.Tech" },
      { key: "branch", label: "Branch / Specialization", type: "department" },
      { key: "admissionReporting", label: "Admission / Reporting", type: "select", options: ["Admission", "Reporting"] },
      { key: "referralType", label: "Direct / Any Staff Referral", type: "select", options: ["Direct", "Staff Referral"] },
      { key: "visitDate", label: "Date of Visit", type: "date" },
      { key: "timeIn", label: "Time In", type: "time" },
      { key: "timeOut", label: "Time Out", type: "time" },
    ],
  },
  {
    kind: "entry",
    key: "CAR_BOOK",
    number: 4,
    title: "Car Book",
    description: "College cars going out and coming back, with odometer readings.",
    required: ["vehicleName", "vehicleNumber"],
    highlightRequired: true,
    movement: {
      in: { label: "In", timeKey: "timeIn", readingKey: "inReading" },
      out: { label: "Out", timeKey: "timeOut", readingKey: "outReading" },
      firstDirections: BOTH,
      // The guard chooses In or Out each time (nothing chosen when the form opens); never "Out only"
      chooseEachTime: true,
      noOneWay: true,
    },
    listFields: ["vehicleName", "vehicleNumber", "timeOut", "timeIn"],
    fields: [
      { key: "vehicleName", label: "Car Name", type: "text", combo: "carName", comboFills: "vehicleNumber" },
      { key: "vehicleNumber", label: "Vehicle Number", type: "text", combo: "vehicle", comboFills: "vehicleName" },
      { key: "remarks", label: "Remarks", type: "textarea" },
      // Older records: kept and shown, not on the new form
      { key: "driverName", label: "Driver", type: "text", formHidden: true },
      { key: "usedBy", label: "Faculty using", type: "text", formHidden: true },
      { key: "purpose", label: "Purpose", type: "text", formHidden: true },
      { key: "date", label: "Date", type: "date" },
      { key: "timeOut", label: "Time Out", type: "time" },
      { key: "outReading", label: "Out Reading (km)", type: "text", formHidden: true },
      { key: "timeIn", label: "Time In", type: "time" },
      { key: "inReading", label: "In Reading (km)", type: "text", formHidden: true },
    ],
  },
  {
    kind: "entry",
    key: "AUTO_BOOK",
    number: 5,
    // Replaced by the one simple Auto Book (AUTO_IN_OUT): kept only so its past
    // records can still be read; no new entries (src/lib/registers/access.ts)
    title: "Old Auto Book",
    description: "College autos with readings (old records only; new autos go in the Auto Book).",
    required: ["autoNumber"],
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
      { key: "outReading", label: "Out Reading", type: "text" },
      { key: "inTime", label: "In Time", type: "time" },
      { key: "inReading", label: "In Reading", type: "text" },
    ],
  },
  {
    kind: "entry",
    key: "DAILY_LABOUR",
    number: 6,
    title: "College Daily Labour Book",
    description: "Daily labour arriving for college work.",
    required: [],
    // In when they arrive; Out once for everyone in the evening, with the counts leaving (same entry)
    movement: {
      in: { label: "In", timeKey: "inTime" },
      out: { label: "Out", timeKey: "outTime" },
      firstDirections: ["IN"],
      fixedStart: true,
      exitCounts: "workers",
    },
    listFields: ["workerType", "workerCount", "workType", "workArea"],
    fields: [
      // Up front: work type, work area, the officer; the workers list below
      { key: "workType", label: "Work Type", type: "text", combo: "options", options: WORK_TYPES, upFront: true },
      { key: "workArea", label: "Work Location", type: "text", combo: "suggest", suggestFirst: ["A Block", "B Block", "C Block"], upFront: true },
      // Not the faculty list: names typed before in this book are suggested
      { key: "authorizedBy", label: "Work Related Officer Name", type: "text", combo: "suggest", upFront: true },
      // More details
      { key: "workDetails", label: "Work Details", type: "textarea" },
      { key: "estate", label: "Estate", type: "text" },
      { key: "date", label: "Date", type: "date" },
      // Set from the workers list on save (older records typed them)
      { key: "workerType", label: "Worker Type", type: "text", formHidden: true },
      { key: "workerCount", label: "Total Workers", type: "number", formHidden: true },
      { key: "mainWorker", label: "Main Worker Details", type: "text", formHidden: true },
      { key: "inTime", label: "In Time", type: "time" },
      { key: "outTime", label: "Out Time", type: "time" },
      // Saved at Out
      { key: "outCounts", label: "Counts at Out", type: "text", formHidden: true },
      { key: "outTotal", label: "Total at Out", type: "number", formHidden: true },
    ],
    groups: [
      {
        key: "workers",
        label: "Workers",
        itemLabel: "Worker",
        max: null,
        minRows: 1,
        required: ["workerType", "count"],
        // "+ Peddamestri / + Chinnamestri / + Cooli" add a row: type, name, count
        picker: "typedRows",
        fields: [
          { key: "workerType", label: "Type", type: "select", options: WORKER_TYPES },
          { key: "name", label: "Name", type: "text" },
          { key: "count", label: "Count", type: "number" },
        ],
      },
    ],
  },
  {
    kind: "entry",
    key: "LABOUR_CONTRACT",
    number: 7,
    title: "College Labour Contract Book",
    description: "Contract labour arriving for college work.",
    required: [],
    // In when they arrive; Out once for everyone in the evening, with the counts leaving (same entry)
    movement: {
      in: { label: "In", timeKey: "inTime" },
      out: { label: "Out", timeKey: "outTime" },
      firstDirections: ["IN"],
      fixedStart: true,
      exitCounts: "workers",
    },
    listFields: ["workerType", "workerCount", "workType", "workArea"],
    fields: [
      // Up front: work type, work area, the officer; the workers list below
      { key: "workType", label: "Work Type", type: "text", combo: "options", options: WORK_TYPES, upFront: true },
      // Contract book: only areas typed before (no A / B / C Block)
      { key: "workArea", label: "Work Location", type: "text", combo: "suggest", upFront: true },
      // Not the faculty list: names typed before in this book are suggested
      { key: "authorizedBy", label: "Work Related Officer Name", type: "text", combo: "suggest", upFront: true },
      // More details
      { key: "workDetails", label: "Work Details", type: "textarea" },
      { key: "estate", label: "Estate", type: "text" },
      { key: "remarks", label: "Remarks", type: "textarea" },
      { key: "date", label: "Date", type: "date" },
      // Set from the workers list on save (older records typed them)
      { key: "workerType", label: "Worker Type", type: "text", formHidden: true },
      { key: "workerCount", label: "Total Workers", type: "number", formHidden: true },
      { key: "mainWorker", label: "Main Worker Details", type: "text", formHidden: true },
      { key: "inTime", label: "In Time", type: "time" },
      { key: "outTime", label: "Out Time", type: "time" },
      // Saved at Out
      { key: "outCounts", label: "Counts at Out", type: "text", formHidden: true },
      { key: "outTotal", label: "Total at Out", type: "number", formHidden: true },
    ],
    groups: [
      {
        key: "workers",
        label: "Workers",
        itemLabel: "Worker",
        max: null,
        minRows: 1,
        required: ["workerType", "count"],
        // "+ Peddamestri / + Chinnamestri / + Cooli" add a row: type, name, count
        picker: "typedRows",
        fields: [
          { key: "workerType", label: "Type", type: "select", options: WORKER_TYPES },
          { key: "name", label: "Name", type: "text" },
          { key: "count", label: "Count", type: "number" },
        ],
      },
    ],
  },
  {
    // One entry with a list of coolies; each cooli has the inputs of the pink
    // "Contract Worker / Daily Labour Pass" slip. Nothing is required, the two
    // signature photos are optional, and Security can edit these entries
    // (every edit is kept in the history).
    kind: "entry",
    key: "COOLI_BOOK",
    number: 21,
    title: "Cooli Book",
    description: "Coolies working on campus: each cooli's slip details, with in and out times.",
    required: [],
    listFields: ["workDetails", "remarks"],
    fixed: [
      {
        label: "Note",
        value: "Kindly ensure that all tools belonging to laborers or contractors are recorded in the Security entry Register.",
        note: true,
      },
    ],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "workDetails", label: "Work / Location", type: "text", placeholder: "e.g. A Block 1st floor plastering" },
      { key: "remarks", label: "Remarks", type: "textarea", updatable: true },
      { key: "paymentCompleted", label: "Payment completed", type: "yesno", updatable: true },
      { key: "securitySignature", label: "Security — signature photo", type: "photo" },
      { key: "estateManagerSignature", label: "Estate Manager — signature photo", type: "photo" },
    ],
    groups: [
      {
        key: "coolies",
        label: "Coolies",
        itemLabel: "Cooli",
        max: null,
        fields: [
          { key: "name", label: "Name", type: "text" },
          { key: "gender", label: "Gender", type: "select", options: ["Male", "Female"] },
          { key: "contractorName", label: "Contractor Name", type: "text" },
          { key: "tools", label: "Tools (Personal) Particulars", type: "text", placeholder: "e.g. trowel, bucket" },
          { key: "personConcerned", label: "Person Concerned & Designation", type: "text" },
          { key: "inTime", label: "In Time", type: "time" },
          { key: "outTime", label: "Out Time", type: "time", completion: true },
        ],
      },
    ],
  },
  {
    kind: "entry",
    key: "SIROS_STOCK",
    number: 8,
    title: "Siros Venture Main Gate Stock Register",
    description: "Material at the Siros Venture main gate: photos, the items and for whom it came.",
    ...stockForm(),
  },
  {
    kind: "entry",
    key: "COLLEGE_STOCK",
    number: 9,
    title: "College Main Gate Stock Entry Register",
    description: "Material at the college main gate: photos, the items and for whom it came.",
    ...stockForm(),
  },
  {
    kind: "entry",
    key: "SIROS_DAILY_LABOUR",
    number: 20,
    // The one Siros Venture labour book (daily and contract labour together)
    title: "Siros Venture Daily Labour & Contract Book",
    description: "Contractors and every worker under them (daily or contract labour): In when they come, Out on the same entry when they leave.",
    ...SIROS_LABOUR_INPUTS,
  },
  {
    kind: "entry",
    key: "SIROS_LABOUR_CONTRACT",
    number: 10,
    // Joined into the Siros Venture Daily Labour & Contract Book (SIROS_DAILY_LABOUR): kept only so
    // its past records can still be read; no new entries (src/lib/registers/access.ts)
    title: "Old Siros Venture Labour Contract Book",
    description: "Contract labour (old records only; new entries go in the Siros Venture Daily Labour & Contract Book).",
    ...SIROS_LABOUR_INPUTS,
  },
  {
    kind: "entry",
    key: "COLLEGE_DAILY",
    number: 11,
    title: "College Daily Book",
    description: "General daily in / out entries.",
    required: ["whoReferred", "purpose"],
    movement: {
      in: { label: "In", timeKey: "time" },
      out: { label: "Out", timeKey: "time" },
      firstDirections: BOTH,
      chooseEachTime: true,
      single: true,
      directionField: "inOut",
    },
    listFields: ["whoReferred", "purpose", "inOut", "time"],
    fields: [
      // Optional photo, taken first (like the stock registers)
      { key: "photo", label: "Photo", type: "photo" },
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
    required: ["shift", "staff"],
    movement: {
      in: { label: "Duty start", timeKey: "dutyStart" },
      out: { label: "Duty end", timeKey: "dutyEnd" },
      firstDirections: ["IN"],
    },
    listFields: ["staff", "rank", "shift", "dutyStart", "dutyEnd"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "shift", label: "Shift", type: "select", options: SHIFTS, allowOther: true },
      { key: "staff", label: "Security Staff", type: "staff" },
      { key: "rank", label: "Rank", type: "text", placeholder: "e.g. Guard, Head Guard" },
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
    description: "Monthly attendance of security staff, with remarks for each day.",
    required: ["staff", "attendanceStatus"],
    movement: { in: { label: "In", timeKey: "inTime" }, out: { label: "Out", timeKey: "outTime" }, firstDirections: ["IN"] },
    listFields: ["staff", "shift", "attendanceStatus", "inTime", "outTime"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "staff", label: "Security Staff (name & employee ID)", type: "staff" },
      { key: "rank", label: "Rank", type: "text", placeholder: "e.g. Guard, Head Guard" },
      { key: "shift", label: "Shift", type: "select", options: SHIFTS, allowOther: true },
      { key: "attendanceStatus", label: "Attendance Status", type: "select", options: ["Present", "Absent", "Late", "Half Day", "On Leave", "Double Duty"] },
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
    // The one Auto Book: every auto (college or outside) coming in or going out.
    // Kept simple on purpose: auto number, driver, anything else; times are automatic.
    title: "Auto Book",
    description: "Autos coming in and going out: auto number, driver and any other details.",
    required: ["driverName", "purpose"],
    highlightRequired: true,
    // The auto comes in first and goes out later (switchable); never "In only"
    movement: {
      in: { label: "In", timeKey: "inTime" },
      out: { label: "Out", timeKey: "outTime" },
      firstDirections: BOTH,
      // The guard chooses In or Out each time (nothing chosen when the form opens)
      chooseEachTime: true,
      noOneWay: true,
      // Going out: the reason, every time
      outReasonKey: "outReason",
    },
    listFields: ["driverName", "purpose", "outReason", "inTime", "outTime"],
    fields: [
      { key: "driverName", label: "Auto Driver Name", type: "text", combo: "driver" },
      { key: "purpose", label: "Purpose", type: "text", combo: "purpose", listFallback: "autoNumber" },
      { key: "outReason", label: "Reason for going out", type: "text", formHidden: true },
      { key: "remarks", label: "Remarks", type: "textarea" },
      { key: "date", label: "Date", type: "date" },
      { key: "inTime", label: "In-Time", type: "time" },
      { key: "outTime", label: "Out-Time", type: "time" },
      // Older records: kept and shown, not on the new form
      { key: "autoNumber", label: "Auto", type: "text", formHidden: true },
      { key: "vehicleName", label: "Auto Name", type: "text", formHidden: true },
      { key: "purposeRemarks", label: "Additional information", type: "textarea", formHidden: true },
    ],
  },
  {
    // Lorries, tractors and other vehicles coming for work (college work or Siros Venture)
    kind: "entry",
    key: "WORK_VEHICLES",
    number: 22,
    title: "Work Vehicles Book",
    description: "Vehicles coming for work: photo, work location, vehicle details; In when they arrive, Out when they leave.",
    required: ["vehiclePhoto", "workArea", "vehicleDetails"],
    movement: {
      in: { label: "In", timeKey: "timeIn" },
      out: { label: "Out", timeKey: "timeOut" },
      firstDirections: ["IN"],
      fixedStart: true,
    },
    listFields: ["vehicleDetails", "workArea", "vehicleNumber", "timeIn", "timeOut"],
    fields: [
      // Photo first (at the top of the form)
      { key: "vehiclePhoto", label: "Vehicle Photo", type: "photo" },
      // General Work / Siros Venture first, then what was typed before
      { key: "workArea", label: "Work Location", type: "text", combo: "suggest", suggestFirst: ["General Work", "Siros Venture"] },
      { key: "vehicleDetails", label: "Vehicle Details", type: "text", placeholder: "e.g. Tractor with sand" },
      { key: "vehicleNumber", label: "Vehicle Number", type: "text", upFront: true },
      { key: "remarks", label: "Remarks", type: "textarea" },
      { key: "date", label: "Date", type: "date" },
      { key: "timeIn", label: "In Time", type: "time" },
      { key: "timeOut", label: "Out Time", type: "time" },
    ],
  },
  {
    kind: "entry",
    key: "KEYS",
    number: 18,
    title: "College Keys Book",
    description: "Keys handed out and returned.",
    // The phone number and details come from the picked faculty / student (no typing)
    required: ["personName", "keyName"],
    highlightRequired: true,
    movement: {
      in: { label: "In", timeKey: "keyReturnedTime" },
      out: { label: "Out", timeKey: "keyTakenTime" },
      // In / Out buttons on the form: nothing chosen until the guard taps one; the same record is marked the other side later
      firstDirections: BOTH,
      chooseEachTime: true,
      noOneWay: true,
    },
    listFields: ["keyName", "personName", "holderId", "keyTakenTime", "keyReturnedTime"],
    fields: [
      { key: "personName", label: "Key taken by", type: "keyHolder", wide: true },
      { key: "keyName", label: "Key Details", type: "text", placeholder: "Which key / room", wide: true },
      // Set by the "Key taken by" box and the server (not typed)
      { key: "holderType", label: "Faculty / Student", type: "select", options: ["Faculty / Staff", "Student"], formHidden: true },
      { key: "holderId", label: "Employee ID / Roll Number", type: "text", formHidden: true },
      { key: "holderDetails", label: "Details", type: "text", formHidden: true },
      { key: "phone", label: "Phone Number", type: "phone", formHidden: true },
      { key: "date", label: "Date", type: "date" },
      { key: "keyTakenTime", label: "Out Time", type: "time" },
      { key: "keyReturnedTime", label: "In Time", type: "time" },
      // Older records: kept and shown, not on the new form
      { key: "purpose", label: "Purpose", type: "text", formHidden: true },
      { key: "keyGivenBy", label: "Key Given By", type: "text", formHidden: true },
      { key: "keyTakenBy", label: "Key Taken By", type: "person", formHidden: true },
      { key: "remarks", label: "Remarks", type: "textarea", formHidden: true },
    ],
  },
  {
    kind: "entry",
    key: "RETURNABLE",
    number: 19,
    title: "Returnable & Non-Returnable Book",
    description: "Material taken out by faculty or staff, returnable or not.",
    // Up front: from (name, designation, department), to (name, phone), returnable or not, the items
    required: ["fromName", "allowingRepresentative", "itemType"],
    movement: {
      in: { label: "In", timeKey: "inTime" },
      out: { label: "Out", timeKey: "outTime" },
      // No In / Out buttons: the material goes Out when saved; a Returnable item is marked In when it comes back
      firstDirections: ["OUT"],
      fixedStart: true,
      // Non-Returnable is saved as Out only (never comes back)
      oneWayWhen: { field: "itemType", value: "Non-Returnable" },
    },
    listFields: ["fromName", "itemType", "allowingRepresentative", "outTime", "inTime"],
    fixed: [{ label: "Institution", value: "Ramachandra College" }],
    fields: [
      // First: Returnable or not (big buttons)
      { key: "itemType", label: "Returnable / Non-Returnable", type: "select", options: ["Returnable", "Non-Returnable"], buttons: true },
      // Picked from the portal's faculty / staff (type to search): their designation and
      // department are filled in by themselves and saved with the record (no boxes to fill)
      {
        key: "fromName",
        section: "Sent by",
        label: "Sent by — Faculty / Staff Name",
        type: "person",
        fills: { designation: "fromDesignation", department: "fromDepartment" },
        wide: true,
      },
      { key: "fromDesignation", label: "Sent by — Designation", type: "text", formHidden: true },
      { key: "fromDepartment", label: "Sent by — Department", type: "department", formHidden: true },
      { key: "allowingRepresentative", label: "Given to — Name", type: "text", section: "Given to" },
      { key: "phone", label: "Given to — Phone Number", type: "phone", upFront: true, section: "Given to" },
      // More details
      { key: "purpose", label: "Taking Out Purpose", type: "text" },
      { key: "allowingDesignation", label: "Given to — Designation", type: "text" },
      { key: "allowingOrganization", label: "Given to — Organisation", type: "text" },
      { key: "allowingCity", label: "Given to — City / Town", type: "text" },
      { key: "outTime", label: "Out-Time", type: "time" },
      { key: "inTime", label: "In-Time", type: "time" },
    ],
    groups: [
      {
        key: "items",
        label: "Items",
        itemLabel: "Item",
        max: 30,
        minRows: 1,
        required: ["description"],
        // "+ Add item" opens a pop-up: item details and a photo (optional); "Add" (next item) or "Done"
        picker: "itemsPopup",
        fields: [
          { key: "description", label: "Item Details", type: "text", placeholder: "e.g. Projector, 1" },
          { key: "photo", label: "Item photos", type: "photo", maxPhotos: 4 },
          // Older records
          { key: "quantity", label: "Quantity", type: "number", formHidden: true },
          { key: "remarks", label: "Remarks", type: "text", formHidden: true },
        ],
      },
    ],
  },
  {
    kind: "entry",
    key: "VEHICLE_FLEET",
    number: 20,
    // Hidden from every register list (src/lib/registers/access.ts): filled only
    // from "New driver / car" in the Car Book and Auto Book.
    title: "Drivers & Vehicles",
    description: "Drivers, cars and autos registered at the Car Book and Auto Book.",
    required: [],
    requiredAny: [["driverName", "vehicleName", "vehicleNumber"]],
    listFields: ["driverName", "vehicleName", "vehicleNumber", "vehicleType"],
    fields: [
      { key: "driverName", label: "Driver Name", type: "text" },
      { key: "driverPhone", label: "Driver Phone", type: "phone" },
      { key: "vehicleName", label: "Vehicle Name", type: "text" },
      { key: "vehicleNumber", label: "Vehicle Number", type: "text" },
      { key: "vehicleType", label: "Vehicle Type", type: "select", options: ["Car", "Auto"] },
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
      // One-way records ("Out only" / "In only", or closed later) never wait for the other side
      if (isBlank(data[side.timeKey]) && data.oneWay !== true) next = { ...side, direction: other };
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

/**
 * The two main gate stock books share one form: the stock, vehicle and bill
 * photos (several each), the items, and for whom it came (Reference). No bill:
 * the supplier's name and phone (and the amount if known); the bill photos are
 * added on the saved record when the bill comes ("Bill updated").
 */
function stockForm(): Pick<EntryRegister, "required" | "requiredUnless" | "listFields" | "fields"> {
  return {
    required: ["materialPhoto", "vehiclePhoto", "billPhoto", "itemName", "reference"],
    requiredUnless: { fields: ["billPhoto"], flag: "noBill" },
    listFields: ["itemName", "reference"],
    fields: [
      { key: "materialPhoto", label: "Stock photos", type: "photo", maxPhotos: 4 },
      { key: "vehiclePhoto", label: "Vehicle photos", type: "photo", maxPhotos: 3 },
      {
        key: "billPhoto",
        label: "Bill photos",
        type: "photo",
        maxPhotos: 4,
        hideWhen: "noBill",
        updatable: true,
        addLaterWhen: "noBill",
        laterStatus: ["Bill updated", "No bill attached"],
      },
      {
        key: "noBill",
        label: "No bill",
        type: "yesno",
        buttons: true,
        options: ["No bill attached", "Has a bill"],
        hint: "The bill photos can be added on the saved record when the bill comes.",
      },
      // No bill: who supplied it (and the amount when known)
      { key: "supplierName", label: "Supplier Name", type: "text", showWhen: "noBill", requiredWhenShown: true },
      { key: "phone", label: "Phone Number", type: "phone", showWhen: "noBill", requiredWhenShown: true },
      { key: "billAmount", label: "Amount (₹)", type: "number", showWhen: "noBill" },
      { key: "itemName", label: "Items / Materials Details", type: "text", wide: true },
      // For whom it came: faculty, staff and the other logins (name and designation)
      { key: "reference", label: "Reference — for whom it came", type: "person", wide: true },
      { key: "date", label: "Date", type: "date" },
      { key: "timeCame", label: "Time Came", type: "time" },
      // Filled later on the saved record
      { key: "handedOverTo", label: "Given To", type: "text", formHidden: true, updatable: true },
      { key: "billTakenBy", label: "Bill Taken By", type: "text", formHidden: true, updatable: true, lockedBy: "billTaken" },
      { key: "billTaken", label: "Bill taken", type: "yesno", updatable: true, formHidden: true, options: ["Bill taken", "Not taken yet"] },
      // Older records: kept and shown, not on the form any more
      { key: "direction", label: "Inward / Outward", type: "select", options: ["Inward", "Outward"], formHidden: true },
      { key: "vehicleNumber", label: "Vehicle Number", type: "text", formHidden: true },
      { key: "quantity", label: "Item Size Details", type: "text", formHidden: true },
      { key: "billNumber", label: "Bill Number", type: "text", formHidden: true },
      { key: "unit", label: "Unit", type: "select", options: UNITS, formHidden: true },
      { key: "condition", label: "Condition", type: "select", options: ["Good", "Damaged", "Partially damaged"], formHidden: true },
      { key: "inventoryStored", label: "Inventory Stored Details", type: "text", formHidden: true },
      { key: "managerDetails", label: "Manager (name & designation)", type: "text", formHidden: true },
      { key: "purposeDestination", label: "Purpose / Destination", type: "text", formHidden: true },
      { key: "remarks", label: "Remarks", type: "textarea", formHidden: true },
    ],
  };
}
