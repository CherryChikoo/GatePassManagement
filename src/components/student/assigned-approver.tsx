import { AlertCircle, ShieldCheck } from "lucide-react";

export type AssignedApprover =
  | { name: string; label: string; available: true; reason?: undefined }
  | { name: null; label: null; available: false; reason: string };

/**
 * Read-only display of who will approve the student's request.
 * Students cannot choose: day scholars → department HOD, hostellers → assigned warden.
 */
export function AssignedApproverCard({
  approver,
  isHosteller,
  accent = "orange",
}: {
  approver: AssignedApprover | null | undefined;
  isHosteller: boolean;
  accent?: "orange" | "emerald";
}) {
  const accentText = accent === "emerald" ? "text-emerald-400" : "text-orange-400";

  if (!approver || !approver.available) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-300">You can't submit a request yet</p>
          <p className="text-amber-200/80 mt-0.5">
            {approver?.reason ||
              (isHosteller
                ? "No hostel warden is assigned to you. Please contact the administrator."
                : "No HOD is assigned to your department. Please contact the administrator.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <ShieldCheck className={`h-4 w-4 ${accentText}`} />
        Approver
      </p>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3.5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-100 truncate">{approver.name}</span>
        <span className={`text-xs font-medium ${accentText} shrink-0`}>{approver.label}</span>
      </div>
      <p className="text-xs text-zinc-500">
        {isHosteller
          ? "Hostel residents' requests go to their assigned hostel warden."
          : "Your request goes to the HOD of your department for approval."}
      </p>
    </div>
  );
}
