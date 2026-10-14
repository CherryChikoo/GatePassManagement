import { facultyRequestTypeLabel } from "@/lib/registers/definitions";
import { formatDate } from "@/lib/utils";

type PassLike = {
  facultyId?: string | null;
  requestType?: string | null;
  exitDate?: string | Date | null;
  endDate?: string | Date | null;
  numberOfDays?: number | null;
  parentInformed?: boolean | null;
  videoCallNumber?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  hostelInchargeDetails?: string | null;
};

/**
 * Faculty Book request type + dates, or hostel outing details, for approver
 * and oversight cards. Renders nothing for passes that have neither.
 */
export function PassExtraDetails({ pass, className = "" }: { pass: PassLike; className?: string }) {
  const range =
    pass.exitDate && pass.endDate && formatDate(pass.endDate) !== formatDate(pass.exitDate)
      ? `${formatDate(pass.exitDate)} – ${formatDate(pass.endDate)}`
      : pass.exitDate
      ? formatDate(pass.exitDate)
      : null;

  if (pass.requestType) {
    return (
      <p className={`text-xs text-zinc-300 ${className}`}>
        <span className="font-semibold text-orange-300">{facultyRequestTypeLabel(pass.requestType)}</span>
        {range && <> • {range}</>}
        {typeof pass.numberOfDays === "number" && pass.numberOfDays > 0 && (
          <> • {pass.numberOfDays} day{pass.numberOfDays === 1 ? "" : "s"}</>
        )}
      </p>
    );
  }

  if (pass.parentInformed !== null && pass.parentInformed !== undefined) {
    const guardian = [pass.guardianName, pass.guardianRelation && `(${pass.guardianRelation})`].filter(Boolean).join(" ");
    return (
      <div className={`text-xs text-zinc-300 space-y-0.5 ${className}`}>
        <p>
          <span className="font-semibold text-sky-300">Outing</span>
          {range && <> • {range}</>}
        </p>
        <p>
          Parent informed: <span className={pass.parentInformed ? "text-emerald-300" : "text-amber-300"}>{pass.parentInformed ? "Yes" : "No"}</span>
          {guardian && <> • {guardian}</>}
          {pass.videoCallNumber && <> • Video call: {pass.videoCallNumber}</>}
        </p>
        {pass.hostelInchargeDetails && <p>Hostel in-charge: {pass.hostelInchargeDetails}</p>}
      </div>
    );
  }
  return null;
}
