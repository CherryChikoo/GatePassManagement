"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ClipboardList, Eye, EyeOff, Loader2, PencilLine, Plus, Trash2 } from "lucide-react";
import { useT } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { actionErrorMessage } from "@/lib/deployment";
import { BUILDER_FIELD_TYPES, slugForKey, type BuilderFieldType } from "@/lib/registers/custom";
import {
  createCustomRegister,
  deleteCustomRegister,
  listCustomRegisters,
  setCustomRegisterActive,
  updateCustomRegister,
} from "@/server/actions/custom-registers";

type Row = Awaited<ReturnType<typeof listCustomRegisters>>[number];

type DraftField = {
  /** set for fields that already exist (keeps their saved data attached) */
  key?: string;
  label: string;
  type: BuilderFieldType;
  optionsText: string;
  required: boolean;
};

type Draft = {
  id?: string;
  title: string;
  description: string;
  hasInOut: boolean;
  /** "Take a photo with each entry" / must it be taken */
  hasPhoto: boolean;
  photoRequired: boolean;
  fields: DraftField[];
  locked: boolean;
};

const emptyField = (): DraftField => ({ label: "", type: "text", optionsText: "", required: false });
const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  hasInOut: false,
  hasPhoto: false,
  photoRequired: false,
  fields: [emptyField()],
  locked: false,
});

const inputCls =
  "h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10";

/**
 * Main Admin / Head Security: create a register with the inputs they need,
 * then edit, disable or delete it. Saved registers appear straight away for
 * Security (to fill in), the Supervisor and Admin.
 */
export function RegisterManager({ base }: { base: string }) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listCustomRegisters());
      setError(null);
    } catch (err) {
      setError(actionErrorMessage(err, t("Could not load the registers.")));
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  function edit(row: Row) {
    const fields = Array.isArray(row.fields) ? (row.fields as any[]) : [];
    setFormError(null);
    setDraft({
      id: row.id,
      title: row.title,
      description: row.description,
      hasInOut: row.hasInOut,
      hasPhoto: fields.some((f) => f.type === "photo"),
      photoRequired: row.required.includes("photo"),
      // In & Out can't change once entries exist
      locked: row.entries > 0,
      // The photo has its own switch, not a row in the field list
      fields: fields.filter((f) => f.type !== "photo").map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        optionsText: Array.isArray(f.options) ? f.options.join("\n") : "",
        required: row.required.includes(f.key),
      })),
    });
  }

  function updateField(i: number, patch: Partial<DraftField>) {
    setDraft((d) => (d ? { ...d, fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) } : d));
  }
  function moveField(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.fields.length) return d;
      const fields = [...d.fields];
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...d, fields };
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    const payload = {
      title: draft.title,
      description: draft.description,
      hasInOut: draft.hasInOut,
      hasPhoto: draft.hasPhoto,
      photoRequired: draft.hasPhoto && draft.photoRequired,
      fields: draft.fields.map((f) => ({
        ...(f.key ? { key: f.key } : {}),
        label: f.label,
        type: f.type,
        required: f.required,
        ...(f.type === "select"
          ? { options: f.optionsText.split(/\r?\n|,/).map((o) => o.trim()).filter(Boolean) }
          : {}),
      })),
    };
    try {
      const res: any = draft.id ? await updateCustomRegister(draft.id, payload) : await createCustomRegister(payload);
      if (res?.error) {
        setFormError(res.error);
      } else {
        setNotice(draft.id ? t("Register updated.") : t("Register created. Security can use it now."));
        setTimeout(() => setNotice(null), 5000);
        setDraft(null);
        await load();
      }
    } catch (err) {
      setFormError(actionErrorMessage(err, t("Could not save. Please try again.")));
    }
    setSaving(false);
  }

  async function toggleActive(row: Row) {
    setBusyId(row.id);
    const res: any = await setCustomRegisterActive(row.id, !row.active).catch(() => ({ error: t("Could not save. Please try again.") }));
    if (res?.error) setError(res.error);
    await load();
    setBusyId(null);
  }

  async function remove(row: Row) {
    setBusyId(row.id);
    const res: any = await deleteCustomRegister(row.id).catch(() => ({ error: t("Could not save. Please try again.") }));
    if (res?.error) setError(res.error);
    else setNotice(t("Register deleted."));
    await load();
    setBusyId(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">{t("Create & manage registers")}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("Design a register with the inputs you need. It appears straight away for Security, the Supervisor and Admin.")}
          </p>
        </div>
        <Button
          onClick={() => {
            setFormError(null);
            setDraft(emptyDraft());
          }}
          className="w-full sm:w-auto h-12"
        >
          <Plus className="h-4 w-4" /> {t("Create register")}
        </Button>
      </div>

      {notice && <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900 shadow-card">
        {rows === null ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">{t("Loading…")}</p>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
              <ClipboardList className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-zinc-100">{t("No registers created yet")}</p>
            <p className="mt-1 text-sm text-zinc-500">{t("Tap “Create register” to design the first one.")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {rows.map((r) => {
              const fieldCount = Array.isArray(r.fields) ? (r.fields as unknown[]).length : 0;
              return (
                <li key={r.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-zinc-100">{r.title}</span>
                        {!r.active && (
                          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-500">{t("Disabled")}</span>
                        )}
                        {r.hasInOut && (
                          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400">{t("In & Out")}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {t("{n} fields", { n: fieldCount })} · {t("{n} entries", { n: r.entries })} · {t("by {name}", { name: r.createdByName })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 sm:pl-14">
                    {r.active && (
                      <Link
                        href={`${base}/registers/${slugForKey(r.key)}`}
                        className="inline-flex h-10 items-center rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
                      >
                        {t("Open")}
                      </Link>
                    )}
                    <button type="button" onClick={() => edit(r)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-orange-400 hover:bg-orange-500/10">
                      <PencilLine className="h-4 w-4" /> {t("Edit")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => toggleActive(r)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-950 disabled:opacity-50"
                    >
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : r.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {r.active ? t("Disable") : t("Enable")}
                    </button>
                    {r.entries === 0 && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => setConfirmDelete(r)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-red-500/20 bg-zinc-900 px-4 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" /> {t("Delete")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Builder */}
      <Modal open={!!draft} onClose={() => !saving && setDraft(null)} title={draft?.id ? t("Edit register") : t("Create register")} className="max-w-2xl">
        {draft && (
          <div className="space-y-5">
            {formError && (
              <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="rb-title" className="block text-sm font-medium text-zinc-300">
                {t("Register name")} <span className="text-orange-400">*</span>
              </label>
              <input
                id="rb-title"
                value={draft.title}
                maxLength={80}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={t("e.g. Parcel & Courier Book")}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rb-desc" className="block text-sm font-medium text-zinc-300">{t("Short description")}</label>
              <input
                id="rb-desc"
                value={draft.description}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder={t("What is recorded in this register")}
                className={inputCls}
              />
            </div>

            {/* In & Out */}
            <label className={`flex items-start gap-3 rounded-2xl border border-zinc-800 p-4 ${draft.locked ? "opacity-60" : "cursor-pointer hover:bg-zinc-950"}`}>
              <input
                type="checkbox"
                checked={draft.hasInOut}
                disabled={draft.locked}
                onChange={(e) => setDraft({ ...draft, hasInOut: e.target.checked })}
                className="mt-0.5 h-5 w-5 accent-orange-500"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-100">{t("In & Out register")}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {draft.locked
                    ? t("Can't be changed after entries have been saved.")
                    : t("Each record starts with In or Out, and the other side is recorded later on the same record (like the Car Book).")}
                </span>
              </span>
            </label>

            {/* Photo */}
            <div className="rounded-2xl border border-zinc-800 p-4 space-y-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={draft.hasPhoto}
                  onChange={(e) => setDraft({ ...draft, hasPhoto: e.target.checked, photoRequired: e.target.checked ? draft.photoRequired : false })}
                  className="mt-0.5 h-5 w-5 accent-orange-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-100">{t("Take a photo with each entry")}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">{t("Security takes a photo with the phone camera when saving an entry.")}</span>
                </span>
              </label>
              {draft.hasPhoto && (
                <label className="ml-8 flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={draft.photoRequired}
                    onChange={(e) => setDraft({ ...draft, photoRequired: e.target.checked })}
                    className="h-5 w-5 accent-orange-500"
                  />
                  {t("Photo required (can't save without it)")}
                </label>
              )}
            </div>

            {/* Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">{t("Form fields")}</p>
                <p className="text-[11px] text-zinc-500">{t("Date and time are added automatically.")}</p>
              </div>
              {draft.fields.map((f, i) => (
                <div key={i} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">{t("Field {n}", { n: i + 1 })}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label={t("Move up")} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-900 disabled:opacity-30">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => moveField(i, 1)} disabled={i === draft.fields.length - 1} aria-label={t("Move down")} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-900 disabled:opacity-30">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, idx) => idx !== i) })}
                        disabled={draft.fields.length === 1}
                        aria-label={t("Remove field")}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-red-400 hover:bg-red-500/10 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={f.label}
                      maxLength={60}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      placeholder={t("Field name, e.g. Courier Company")}
                      aria-label={t("Field name")}
                      className={inputCls}
                    />
                    <select
                      value={f.type}
                      onChange={(e) => updateField(i, { type: e.target.value as BuilderFieldType })}
                      aria-label={t("Field type")}
                      className={inputCls}
                    >
                      {BUILDER_FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>
                          {t(ft.label)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {f.type === "select" && (
                    <textarea
                      value={f.optionsText}
                      onChange={(e) => updateField(i, { optionsText: e.target.value })}
                      rows={3}
                      placeholder={t("Choices, one per line (at least 2)")}
                      aria-label={t("Choices")}
                      className={`${inputCls} h-auto py-3`}
                    />
                  )}
                  <label className="flex items-center gap-2.5 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                      className="h-5 w-5 accent-orange-500"
                    />
                    {t("Required (must be filled in)")}
                  </label>
                </div>
              ))}
              <button
                type="button"
                disabled={draft.fields.length >= 25}
                onClick={() => setDraft({ ...draft, fields: [...draft.fields, emptyField()] })}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-500/40 text-sm font-medium text-orange-400 hover:bg-orange-500/5 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> {t("Add field")}
              </button>
            </div>

            <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 border-t border-zinc-800 bg-zinc-900 px-4 sm:px-6 py-3">
              <Button onClick={save} disabled={saving} className="h-12 w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {draft.id ? t("Save changes") : t("Create register")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("Delete this register?")}
        description={t("It has no entries yet, so nothing is lost. This can't be undone.")}
        confirmText={t("Delete")}
        variant="danger"
        onConfirm={() => {
          const r = confirmDelete;
          setConfirmDelete(null);
          if (r) remove(r);
        }}
      />
    </div>
  );
}
