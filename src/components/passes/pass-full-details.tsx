"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, ClipboardList, DoorOpen, Home, Loader2, LogIn, LogOut, QrCode, UserRound, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { useT } from "@/components/providers/language-provider";
import { formatDateTime } from "@/lib/utils";
import { facultyRequestTypeLabel } from "@/lib/registers/definitions";
import { getPassFullDetails } from "@/server/actions/pass-details";

type Details = Exclude<Awaited<ReturnType<typeof getPassFullDetails>>, { error: string }>;

const PERSON_TYPE: Record<string, string> = { DAY_SCHOLAR: "Day scholar", HOSTELLER: "Hosteller" };
const HOSTEL: Record<string, string> = { BOYS: "Boys hostel", LADIES: "Ladies hostel" };

// Passes opened in the last minute show instantly when opened again
const cache = new Map<string, { at: number; data: Details }>();
const CACHE_MS = 60_000;
// Requests already on their way (a press starts one; the popup reuses it)
const inFlight = new Map<string, Promise<any>>();

function load(permissionId: string): Promise<any> {
  const hit = cache.get(permissionId);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);
  let p = inFlight.get(permissionId);
  if (!p) {
    p = getPassFullDetails(permissionId)
      .then((res: any) => {
        if (!res?.error) cache.set(permissionId, { at: Date.now(), data: res });
        return res;
      })
      .finally(() => inFlight.delete(permissionId));
    inFlight.set(permissionId, p);
  }
  return p;
}

/** Start loading a pass as soon as a row is pressed (before the tap ends). */
export function prefetchPassDetails(permissionId: string | null | undefined) {
  if (permissionId) load(permissionId).catch(() => {});
}

/**
 * Everything about one pass — used in every login's "Permission Details"
 * popup, for student and faculty passes alike. The row that was tapped
 * (`preview`) shows its name, ID, status and purpose at once while the rest
 * loads.
 */
export function PassFullDetails({ permissionId, preview }: { permissionId: string; preview?: any }) {
  const t = useT();
  const cached = cache.get(permissionId);
  const [data, setData] = useState<Details | null>(cached && Date.now() - cached.at < CACHE_MS ? cached.data : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hit = cache.get(permissionId);
    if (hit && Date.now() - hit.at < CACHE_MS) return;
    let alive = true;
    load(permissionId)
      .then((res: any) => {
        if (!alive) return;
        if (res?.error) setError(res.error);
        else setData(res);
      })
      .catch(() => alive && setError("Could not load the pass details."));
    return () => {
      alive = false;
    };
  }, [permissionId]);

  if (error) return <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{t(error)}</p>;
  if (!data) {
    // What the tapped row already knows, at once; the rest fills in
    const person = preview?.student ?? preview?.faculty ?? null;
    const name = person?.profile?.name ?? preview?.name ?? null;
    const idCode = preview?.student?.studentRoll ?? preview?.faculty?.employeeId ?? null;
    const purpose = preview?.purpose ?? preview?.permission?.purpose ?? null;
    return (
      <div className="space-y-5">
        {(name || purpose) && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {name && <p className="text-lg font-semibold text-zinc-100 break-words">{name}</p>}
              {idCode && <p className="mt-0.5 font-mono text-sm text-zinc-400">{idCode}</p>}
              {purpose && <p className="mt-2 text-sm text-zinc-300">{purpose}</p>}
            </div>
            {preview?.status && <StatusBadge status={preview.status} />}
          </div>
        )}
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/60" />
              <div className="h-12 animate-pulse rounded-2xl bg-zinc-950" />
            </div>
          ))}
        </div>
        <p className="flex items-center justify-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Loading…")}
        </p>
      </div>
    );
  }

  const { pass: p, person, movements } = data;
  const dt = (v?: string | null) => (v ? formatDateTime(v) : null);
  const day = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null;
  const yes = (v: boolean | null | undefined) => (v === true ? t("Yes") : v === false ? t("No") : null);
  const dates = p.endDate && day(p.endDate) !== day(p.exitDate) ? `${day(p.exitDate)} – ${day(p.endDate)}` : day(p.exitDate);

  return (
    <div className="space-y-4">
      {/* Person */}
      {person && (
        <Section title={person.kind === "STUDENT" ? t("Student") : t("Faculty")} icon={<UserRound />}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-zinc-100 break-words">{person.name}</p>
              <p className="mt-0.5 font-mono text-sm text-zinc-400">{person.idCode || "—"}</p>
            </div>
            <StatusBadge status={p.status} />
          </div>
          <Grid
            items={
              person.kind === "STUDENT"
                ? [
                    [t("Department"), person.department],
                    [t("Year / Semester"), [person.year && `${t("Year")} ${person.year}`, person.semester && `${t("Sem")} ${person.semester}`, person.section && `${t("Sec")} ${person.section}`].filter(Boolean).join(" · ")],
                    [t("Type"), t(PERSON_TYPE[person.studentType] ?? person.studentType)],
                    [t("Hostel"), person.hostelType ? [t(HOSTEL[person.hostelType] ?? person.hostelType), person.hostelBlock, person.roomNumber && `${t("Room")} ${person.roomNumber}`].filter(Boolean).join(" · ") : null],
                    [t("Phone"), person.phone],
                    [t("Email"), person.email],
                    [t("Faculty mentor"), person.mentor],
                    [t("Warden"), person.warden],
                  ]
                : [
                    [t("Department"), person.department],
                    [t("Designation"), person.designation],
                    [t("Phone"), person.phone],
                    [t("Email"), person.email],
                  ]
            }
          />
        </Section>
      )}

      {/* Request */}
      <Section title={t("Request")} icon={<ClipboardList />}>
        <Grid
          items={[
            [t("Pass type"), p.requestType ? t(facultyRequestTypeLabel(p.requestType)) : p.passKind === "HOSTEL" ? t("Hostel pass") : p.type === "ENTRY" ? t("Entry pass") : p.endDate ? t("Outing pass") : t("Exit pass")],
            [t("Purpose"), p.purpose],
            [t("Destination"), p.destination],
            [t("Pass dates"), dates],
            [t("Number of days"), p.numberOfDays != null ? String(p.numberOfDays) : null],
            [t("Expected exit"), dt(p.expectedExit)],
            [t("Expected return"), dt(p.expectedReturn)],
            [t("Contact number"), p.contactNumber],
            [t("Remarks"), p.remarks],
            [t("Requested on"), dt(p.requestedAt)],
          ]}
        />
      </Section>

      {/* Approval */}
      <Section title={t("Approval")} icon={<BadgeCheck />}>
        {p.approvedBy.length > 0 ? (
          <ul className="space-y-2">
            {p.approvedBy.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-zinc-200">
                  <span className="font-medium">{a.name || t(a.role)}</span>
                  {a.name && <span className="text-zinc-500"> · {t(a.role)}</span>}
                  {a.at && <span className="block text-xs text-zinc-500">{dt(a.at)}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : p.rejectedAt || p.rejectionReason ? (
          <p className="flex items-start gap-2.5 text-sm text-red-400">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("Rejected")} {p.rejectedAt && <span className="text-zinc-500">· {dt(p.rejectedAt)}</span>}
              {p.rejectionReason && <span className="block text-zinc-300">{t("Reason")}: {p.rejectionReason}</span>}
            </span>
          </p>
        ) : (
          <p className="text-sm text-zinc-500">{p.cancelledAt
            ? `${t("Cancelled")} · ${dt(p.cancelledAt)}`
            : p.status === "EXPIRED"
            ? t("Expired before it was approved")
            : t("Not approved yet")}</p>
        )}
        {p.approvalMode === "BOTH" && <p className="mt-2 text-xs text-zinc-500">{t("Needs both HOD and Dean approval")}</p>}
        {p.approvalNote && <p className="mt-2 text-sm text-zinc-300">{t("Note")}: {p.approvalNote}</p>}
      </Section>

      {/* Hostel outing */}
      {(p.guardianName || p.parentInformed != null || p.videoCallNumber || p.hostelInchargeDetails || p.wardenDetails || p.wardenScannedAt) && (
        <Section title={t("Outing details")} icon={<Home />}>
          <Grid
            items={[
              [t("Informed to parent / guardian"), yes(p.parentInformed)],
              [t("Video call made to"), p.videoCallNumber],
              [t("Parent / Guardian"), p.guardianName],
              [t("Relation"), p.guardianRelation],
              [t("Hostel in-charge"), p.hostelInchargeDetails],
              [t("Warden"), p.wardenDetails],
              [t("Scanned by warden"), dt(p.wardenScannedAt)],
            ]}
          />
        </Section>
      )}

      {/* Gate scans */}
      <Section title={t("Gate scans")} icon={<DoorOpen />}>
        {movements.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("No gate scans recorded yet.")}</p>
        ) : (
          <ul className="space-y-3">
            {movements.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                {m.photoUrl ? (
                   
                  <img src={m.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-zinc-800 object-cover" />
                ) : (
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${m.type === "EXIT" ? "bg-sky-500/10 text-sky-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                    {m.type === "EXIT" ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0 text-sm">
                  <p className={`font-semibold ${m.type === "EXIT" ? "text-sky-500" : "text-emerald-500"}`}>{m.type === "EXIT" ? t("Exit") : t("Entry")}</p>
                  <p className="tabular-nums text-zinc-200">{dt(m.at)}</p>
                  <p className="text-xs text-zinc-500">
                    {[m.gate, m.guard && `${t("by")} ${m.guard}${m.guardEmployeeId ? ` (${m.guardEmployeeId})` : ""}`].filter(Boolean).join(" · ")}
                  </p>
                  {m.notes && <p className="mt-1 text-xs text-zinc-400">{t("Note")}: {m.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* QR */}
      {p.qr && (
        <Section title={t("QR pass")} icon={<QrCode />}>
          <Grid
            items={[
              [t("Status"), p.qr.active ? t("Active") : t("Inactive")],
              [t("Used for exit"), yes(p.qr.usedForExit)],
              [t("Used for entry"), yes(p.qr.usedForEntry)],
              [t("Valid until"), dt(p.qr.expiresAt)],
            ]}
          />
        </Section>
      )}
    </div>
  );
}

/** One block of the pass: its own card, with an icon and a clear heading. */
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-card space-y-3">
      <h3 className="flex items-center gap-2 border-b border-zinc-800 pb-2.5 text-xs font-semibold uppercase tracking-wider text-orange-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/10 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Label / value pairs; empty values are left out. */
function Grid({ items }: { items: [string, string | null | undefined | false][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== false && String(v).trim() !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-zinc-100 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
