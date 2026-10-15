"use client";
import { useT } from "@/components/providers/language-provider";

import { useCallback, useEffect, useState } from "react";
import { FilePlus2, History, LogIn, LogOut, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Modal } from "@/components/ui/primitives";
import type { EntryRegister } from "@/lib/registers/definitions";
import { pendingActions } from "@/lib/registers/definitions";
import {
  adminDeleteRegisterEntry,
  adminUpdateRegisterEntry,
  completeRegisterEntry,
  createRegisterEntry,
  getRegisterStaffOptions,
  listRegisterEntries,
} from "@/server/actions/registers";
import { actionErrorMessage } from "@/lib/deployment";
import { AdminEditForm, MovementForm, RegisterForm, type StaffOption } from "./register-form";
import { formatFieldValue, formatInstant, newClientToken } from "./format";
import { displayValue } from "./localize";
import type { Translate } from "@/lib/i18n";
import { Pager, RegisterToolbar, useRegisterFilters } from "./toolbar";

type Supplement = {
  id: string;
  kind: string;
  data: Record<string, any>;
  reason: string | null;
  createdAt: string;
  recordedByName: string;
  recordedByRole: string;
  recordedByEmployeeId: string | null;
  recordedAtGate: string | null;
};
type Entry = {
  id: string;
  entryDate: string;
  createdAt: string;
  recordedByName: string;
  recordedByRole: string;
  recordedByEmployeeId: string | null;
  recordedAtGate: string | null;
  original: Record<string, any>;
  current: Record<string, any>;
  supplements: Supplement[];
};

function recorderLine(r: { recordedByName: string; recordedByRole: string; recordedByEmployeeId: string | null; recordedAtGate: string | null }, t: Translate) {
  return [r.recordedByName, r.recordedByEmployeeId, r.recordedAtGate, r.recordedByRole === "ADMIN" ? t("Admin") : null].filter(Boolean).join(" • ");
}

/** "Record In" / "Record Out" / "Mark workers out" — what the guard can still record. */
function nextActionLabel(def: EntryRegister, current: Record<string, any>, t: Translate): string | null {
  const p = pendingActions(def, current);
  if (p.next) return t("Record {side}", { side: p.next.label });
  if (p.groups.length) return t("Mark {group} out", { group: p.groups[0].group.label.toLowerCase() });
  return null;
}

export function EntryRegisterView({
  def,
  canCreate,
  canAdminEdit = false,
}: {
  def: EntryRegister;
  canCreate: boolean;
  /** Main Admin: edit and delete saved records */
  canAdminEdit?: boolean;
}) {
  const t = useT();
  const filters = useRegisterFilters();
  const [data, setData] = useState<{ entries: Entry[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [mode, setMode] = useState<null | "new" | "record" | "edit">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState(newClientToken);
  const [formKey, setFormKey] = useState(0);

  const needsStaff = def.fields.some((f) => f.type === "staff");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await listRegisterEntries({ register: def.key, date: filters.dateParam, q: filters.q, page: filters.page });
      if (res.error) setError(res.error);
      else setData({ entries: res.entries, total: res.total, pageSize: res.pageSize });
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not load the register.")));
    }
    setLoading(false);
  }, [def.key, filters.dateParam, filters.q, filters.page, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (needsStaff) getRegisterStaffOptions().then(setStaff).catch(() => setStaff([]));
  }, [needsStaff]);

  function openMode(m: "new" | "record" | "edit", entry?: Entry | null) {
    setFormError(null);
    setToken(newClientToken());
    setFormKey((k) => k + 1);
    if (entry !== undefined) setSelected(entry);
    setMode(m);
  }

  async function run(action: () => Promise<any>, done: string) {
    setBusy(true);
    setFormError(null);
    try {
      const res = await action();
      if (res?.error) {
        setFormError(res.error);
      } else {
        setNotice(done);
        setTimeout(() => setNotice(null), 4000);
        setMode(null);
        setSelected(null);
        await load();
      }
    } catch (err) {
      setFormError(actionErrorMessage(err, t("Could not save. Please try again.")));
    }
    setBusy(false);
  }

  const columns = def.listFields.map((k) => def.fields.find((f) => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f);

  return (
    <div className="space-y-4">
      <RegisterToolbar
        filters={filters}
        action={
          canCreate ? (
            <button
              onClick={() => openMode("new", null)}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold"
            >
              <FilePlus2 className="h-4 w-4" /> {t("New entry")}
            </button>
          ) : null
        }
      />

      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>}

      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">{t("Date")}</th>
                {def.movement && !def.movement.single && <th className="px-3 py-2.5 font-medium whitespace-nowrap">{t("Started")}</th>}
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 font-medium whitespace-nowrap">{c.label}</th>
                ))}
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">{t("Recorded by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {data?.entries.map((e) => {
                const open = pendingActions(def, e.current).any;
                const dir = e.current.direction;
                return (
                  <tr key={e.id} onClick={() => setSelected(e)} className="cursor-pointer hover:bg-zinc-800/40">
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">
                      {formatFieldValue({ key: "d", label: "", type: "date" }, e.entryDate)}
                      {open && <span className="block mt-0.5 w-fit text-[10px] rounded bg-amber-500/15 text-amber-300 px-1.5">{t("Open")}</span>}
                    </td>
                    {def.movement && !def.movement.single && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {dir ? (
                          <span className={`text-xs font-semibold ${dir === "IN" ? "text-emerald-300" : "text-orange-300"}`}>
                            {dir === "IN" ? def.movement.in.label : def.movement.out.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td key={c.key} className={`px-3 py-2.5 whitespace-nowrap max-w-[220px] truncate ${i === 0 ? "font-medium text-zinc-100" : "text-zinc-400"}`}>
                        {displayValue(c, e.current[c.key], t)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 whitespace-nowrap text-zinc-400">{e.recordedByName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data && data.entries.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">{filters.dateParam === "all" ? t("No records yet.") : t("No records for this date.")}</p>
        )}
        {!data && !error && <p className="px-4 py-10 text-center text-sm text-zinc-500">{t("Loading…")}</p>}
      </div>

      {data && <Pager page={filters.page} pageSize={data.pageSize} total={data.total} onPage={filters.setPage} />}

      {/* Details */}
      <Modal open={!!selected && mode === null} onClose={() => setSelected(null)} title={def.title} className="max-w-2xl">
        {selected && (
          <EntryDetails
            def={def}
            entry={selected}
            onRecord={canCreate && pendingActions(def, selected.current).any ? () => openMode("record") : undefined}
            onEdit={canAdminEdit ? () => openMode("edit") : undefined}
            onDelete={canAdminEdit ? () => setConfirmDelete(true) : undefined}
          />
        )}
      </Modal>

      {/* New record / record the other side */}
      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={
          mode === "new"
            ? `${t("New entry")} — ${def.title}`
            : mode === "edit"
            ? `${t("Edit record")} — ${def.title}`
            : selected
            ? nextActionLabel(def, selected.current, t) ?? def.title
            : def.title
        }
        className="max-w-2xl"
      >
        {formError && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{formError}</div>}
        {mode === "new" && (
          <RegisterForm
            key={formKey}
            def={def}
            staff={staff}
            busy={busy}
            onSubmit={(payload) => run(() => createRegisterEntry(def.key, payload, token), t("Record saved."))}
          />
        )}
        {mode === "edit" && selected && (
          <AdminEditForm
            key={formKey}
            def={def}
            current={selected.current}
            staff={staff}
            busy={busy}
            onSubmit={(payload) => run(() => adminUpdateRegisterEntry(selected.id, payload), "Record updated.")}
          />
        )}
        {mode === "record" && selected && (
          <MovementForm
            key={formKey}
            def={def}
            current={selected.current}
            busy={busy}
            onSubmit={(payload) => run(() => completeRegisterEntry(selected.id, payload, token), t("Saved."))}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this record?"
        description="The record is removed permanently from this register and cannot be recovered."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          if (selected) {
            const id = selected.id;
            run(() => adminDeleteRegisterEntry(id), "Record deleted.");
          }
        }}
      />
    </div>
  );
}

function ValuesGrid({ def, values }: { def: EntryRegister; values: Record<string, any> }) {
  const t = useT();
  const m = def.movement;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {m && !m.single && values.direction && (
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{t("Started with")}</dt>
            <dd className="text-sm text-zinc-200">{values.direction === "IN" ? m.in.label : m.out.label}</dd>
          </div>
        )}
        {def.fixed?.map((x) => (
          <div key={x.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{x.label}</dt>
            <dd className="text-sm text-zinc-200">{x.value}</dd>
          </div>
        ))}
        {def.fields.map((f) => (
          <div key={f.key} className={`min-w-0 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
            <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{f.label}</dt>
            <dd className="text-sm text-zinc-200 break-words">{displayValue(f, values[f.key], t)}</dd>
          </div>
        ))}
      </dl>
      {(def.groups ?? []).map((g) => {
        const rows = Array.isArray(values[g.key]) ? (values[g.key] as Record<string, any>[]) : [];
        const total = def.key === "SIROS_LABOUR_CONTRACT" && typeof values.totalWorkers === "number" ? values.totalWorkers : null;
        return (
          <div key={g.key}>
            <p className="text-sm font-semibold text-zinc-200 mb-2">
              {g.label} ({rows.length}{total !== null ? ` / ${total}` : ""})
            </p>
            {total !== null && rows.length < total && (
              <p className="text-xs text-amber-300 mb-2">{t("Details were entered for {n} of {total} workers.", { n: rows.length, total })}</p>
            )}
            {rows.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("None")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-left text-zinc-500">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      {g.fields.map((f) => (
                        <th key={f.key} className="px-2 py-2 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-zinc-500">{i + 1}</td>
                        {g.fields.map((f) => (
                          <td key={f.key} className="px-2 py-1.5 text-zinc-200 whitespace-nowrap">{displayValue(f, r[f.key], t)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EntryDetails({
  def,
  entry,
  onRecord,
  onEdit,
  onDelete,
}: {
  def: EntryRegister;
  entry: Entry;
  onRecord?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const label = nextActionLabel(def, entry.current, t);
  const p = pendingActions(def, entry.current);
  const Icon = p.next?.direction === "OUT" ? LogOut : LogIn;
  return (
    <div className="space-y-5">
      <ValuesGrid def={def} values={entry.current} />

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> {t("Record history")}</p>
        <ul className="space-y-1.5 text-xs text-zinc-300">
          <li>
            <span className="text-zinc-500">{formatInstant(entry.createdAt)}</span> — {t("Recorded by")} {recorderLine(entry, t)}
          </li>
          {entry.supplements.map((s) => (
            <li key={s.id}>
              <span className="text-zinc-500">{formatInstant(s.createdAt)}</span> — {s.kind === "CORRECTION" ? t("Correction by") : t("Updated by")} {recorderLine(s, t)}
              {s.reason && <span className="block text-zinc-400 pl-3">{t("Reason")}: {s.reason}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        {onRecord && label && (
          <button onClick={onRecord} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
            <Icon className="h-4 w-4" /> {label}
          </button>
        )}
        {onEdit && (
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-sm font-semibold">
            <Pencil className="h-4 w-4" /> {t("Edit")}
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm font-semibold">
            <Trash2 className="h-4 w-4" /> {t("Delete")}
          </button>
        )}
      </div>
    </div>
  );
}
