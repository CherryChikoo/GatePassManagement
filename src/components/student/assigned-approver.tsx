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
  comingIn = false,
}: {
  approver: AssignedApprover | null | undefined;
  isHosteller: boolean;
  accent?: "orange" | "emerald";
  /** Coming in (day scholars): no approval — the HOD is only told */
  comingIn?: boolean;
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
      <p className="text-sm font-medium text-zinc-300">{comingIn ? "No approval needed — your HOD will be informed" : "Approver"}</p>
      <div className="flex items-center gap-3 rounded-2xl border border-orange-500/20 bg-white px-3 py-3 shadow-[inset_0_1px_0_#ffffff,0_8px_20px_-16px_rgba(207,62,37,0.45)]">
        <span className="icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{approver.name}</span>
        <span className="shrink-0 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600">{approver.label}</span>
      </div>

    </div>
  );
}
