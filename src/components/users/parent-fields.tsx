"use client";

import { Input } from "@/components/ui/input";
import type { ParentDetails } from "@/lib/students/parents";

/**
 * A student's parents / guardian, inside a numbered Part of the Create / Edit
 * window. When one of them comes to the gate, Security picks the student and
 * these fill the Visitors Book form.
 */
export function ParentFields({ defaults, isNew }: { defaults?: ParentDetails; isNew: boolean }) {
  const d = defaults ?? {};
  const v = (k: keyof ParentDetails) => d[k] ?? "";
  return (
    <>
      <p className="sm:col-span-2 -mt-1 text-xs leading-relaxed text-zinc-500">
        {isNew ? "Fill the father's or the mother's name and mobile, and the home address. " : ""}
        Used to fill the Visitors Book when they come to the gate.
      </p>
      <Input label="Father's name" name="fatherName" maxLength={100} defaultValue={v("fatherName")} autoCapitalize="words" />
      <Input label="Father's mobile" name="fatherPhone" type="tel" inputMode="tel" maxLength={15} defaultValue={v("fatherPhone")} placeholder="10-digit mobile" />
      <Input label="Mother's name" name="motherName" maxLength={100} defaultValue={v("motherName")} autoCapitalize="words" />
      <Input label="Mother's mobile" name="motherPhone" type="tel" inputMode="tel" maxLength={15} defaultValue={v("motherPhone")} placeholder="10-digit mobile" />
      <Input label="Guardian's name (optional)" name="guardianName" maxLength={100} defaultValue={v("guardianName")} autoCapitalize="words" />
      <Input label="Guardian's relation" name="guardianRelation" maxLength={50} defaultValue={v("guardianRelation")} placeholder="e.g. Uncle" />
      <Input label="Guardian's mobile" name="guardianPhone" type="tel" inputMode="tel" maxLength={15} defaultValue={v("guardianPhone")} placeholder="10-digit mobile" />
      <Input
        label="Usual vehicle number (optional)"
        name="parentVehicle"
        maxLength={30}
        defaultValue={v("parentVehicle")}
        autoCapitalize="characters"
        placeholder="e.g. AP 39 AB 1234"
      />
      <Input
        label={isNew ? "Home address *" : "Home address"}
        name="homeAddress"
        required={isNew}
        maxLength={300}
        defaultValue={v("homeAddress")}
        placeholder="Village / town, district"
        wrapperClassName="sm:col-span-2"
      />
    </>
  );
}
