"use client";

/**
 * Main Admin → Offices: the offices visitors come to (Accounts, Exam cell…).
 * Each has a printed QR poster; a visitor scans it with their phone after
 * their work there, which unlocks their Exit QR for the gate.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Edit, Plus, Power, QrCode, RefreshCw } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Modal, EmptyState } from "@/components/ui/primitives";
import { BackButton } from "@/components/ui/back-button";
import { callGate } from "@/lib/gate-call";
import { formatDate } from "@/lib/utils";
import type { OfficeRow } from "@/server/actions/offices";

interface Props {
  /** null = the list could not be loaded on the server */
  offices: OfficeRow[] | null;
}

/** Active first, then A–Z (same order as the server) */
const sortOffices = (rows: OfficeRow[]) =>
  [...rows].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

/** callGate throws Errors whose message is meant for the person */
const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function OfficesClient({ offices }: Props) {
  const [list, setList] = useState<OfficeRow[] | null>(offices);
  const [loadError, setLoadError] = useState(offices === null);
  const [reloading, setReloading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // The office being renamed (null = adding a new one)
  const [editing, setEditing] = useState<OfficeRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // A switch on/off that was refused or failed (shown above the list)
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    setList(offices);
    setLoadError(offices === null);
  }, [offices]);

  async function reload() {
    setReloading(true);
    try {
      const rows = await callGate("listOffices", [], 15_000);
      if (Array.isArray(rows)) {
        setList(rows);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setReloading(false);
    }
  }

  async function handleSave(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await callGate("renameOffice", [editing.id, name], 20_000);
        if ("error" in res) return setError(res.error);
        const clean = name.trim().replace(/\s+/g, " ");
        setList((prev) => sortOffices((prev ?? []).map((o) => (o.id === editing.id ? { ...o, name: clean } : o))));
      } else {
        const res = await callGate("createOffice", [name], 20_000);
        if ("error" in res) return setError(res.error);
        setList((prev) => sortOffices([...(prev ?? []), res.office]));
      }
      closeModal();
    } catch (err) {
      setError(errorText(err, "Could not save the office. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(office: OfficeRow) {
    if (toggling) return;
    setToggling(office.id);
    setListError(null);
    const set = (active: boolean) =>
      setList((prev) => sortOffices((prev ?? []).map((o) => (o.id === office.id ? { ...o, active } : o))));
    // Shown switched at once; switched back if the server refuses
    set(!office.active);
    try {
      const res = await callGate("setOfficeActive", [office.id, !office.active], 20_000);
      if ("error" in res) {
        set(office.active);
        setListError(res.error);
      }
    } catch (err) {
      set(office.active);
      setListError(errorText(err, "Could not change the office. Please try again."));
    } finally {
      setToggling(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setError(null);
    setShowModal(true);
  }

  function openEdit(office: OfficeRow) {
    setEditing(office);
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setError(null);
    setEditing(null);
  }

  const activeCount = list?.filter((o) => o.active).length ?? 0;

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        {listError && (
          <div role="alert" className="flex items-center gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <span className="min-w-0 flex-1">{listError}</span>
            <button type="button" onClick={() => setListError(null)} className="shrink-0 px-2 text-xs font-semibold hover:underline">
              OK
            </button>
          </div>
        )}
        <div className="space-y-3">
          <BackButton href="/admin" label="Back to Dashboard" className="-ml-2" />
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">Offices</h1>
              <p className="mt-1 max-w-xl text-sm text-zinc-500">
                Print each office&apos;s QR poster and put it up at that office. Visitors scan it with their phone after
                their work there, then show their Exit QR at the gate.
              </p>
              {list && list.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  {activeCount} of {list.length} office(s) on
                </p>
              )}
            </div>
            {!loadError && (
              <Button onClick={openCreate} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Add Office
              </Button>
            )}
          </div>
        </div>

        {loadError || !list ? (
          <Card>
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="Could not load the offices"
              description="Check the connection and try again. If visitor check-in was just added, the database update for it may not have been run yet."
              action={
                <Button variant="outline" onClick={reload} loading={reloading}>
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </Button>
              }
            />
          </Card>
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="No Offices Yet"
              description="Add the offices visitors come to, like Accounts or Exam cell, then print a QR poster for each."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Add First Office
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {list.map((office) => (
              <Card key={office.id} glow className="flex flex-col">
                <CardContent className="p-5 sm:p-6 flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          office.active ? "bg-orange-500/10 text-orange-400" : "bg-zinc-950 text-zinc-500"
                        }`}
                      >
                        <Building2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-medium text-zinc-100 truncate">{office.name}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {office.active ? "Poster works" : "Poster switched off"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={office.active ? "success" : "danger"} className="shrink-0">
                      {office.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="space-y-3 border-t border-zinc-800/70 pt-4">
                      <p className="text-xs text-zinc-500">Created {formatDate(office.createdAt)}</p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/offices/${office.id}/poster`}
                          className="inline-flex h-10 sm:h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-orange-600 px-3.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Poster
                        </Link>
                        <Button variant="outline" size="sm" onClick={() => openEdit(office)} className="h-10 sm:h-9">
                          <Edit className="h-3.5 w-3.5" />
                          Rename
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(office)}
                          loading={toggling === office.id}
                          className={`h-10 sm:h-9 ${office.active ? "text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/40" : "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/40"}`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {office.active ? "Turn off" : "Turn on"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={closeModal} title={editing ? "Rename Office" : "Add Office"}>
        <form
          // Not a form action: React resets action forms after submit, which would
          // wipe what was typed when the server returns an error.
          onSubmit={(e) => {
            e.preventDefault();
            handleSave(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          {error && (
            <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
          )}
          <Input
            name="name"
            label="Office Name *"
            placeholder="e.g., Accounts, Exam cell"
            defaultValue={editing?.name || ""}
            maxLength={60}
            required
            id="office-name"
          />
          {editing && (
            <p className="text-xs text-zinc-500">The printed poster keeps working; reprint it to show the new name.</p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editing ? "Save Changes" : <><Plus className="h-4 w-4" />Add Office</>}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
