"use client";

import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Modal, EmptyState } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { createGate, updateGate, toggleGateActive } from "@/server/actions/admin";
import { formatDate } from "@/lib/utils";
import { actionErrorMessage } from "@/lib/deployment";
import { DoorOpen, Plus, ArrowLeft, MapPin, Edit, Power } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";

interface Props {
  user: { name: string; email: string; role: string };
  gates: any[];
}

export function GatesClient({ user, gates }: Props) {
  const [gatesList, setGatesList] = useState(gates);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingGate, setEditingGate] = useState<any | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // A switch on/off that was refused or failed (shown above the list)
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    setGatesList(gates);
  }, [gates]);

  async function handleSave(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const result = editingGate
        ? await updateGate(editingGate.id, formData)
        : await createGate(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setShowModal(false);
        setEditingGate(null);
      }
    } catch (err) {
      setError(actionErrorMessage(err, "Could not save the gate. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string) {
    if (toggling) return;
    setToggling(id);
    setListError(null);
    const flip = () => setGatesList((prev) => prev.map((g) => (g.id === id ? { ...g, active: !g.active } : g)));
    // Shown switched at once; switched back if the server refuses
    flip();
    try {
      const res: any = await toggleGateActive(id);
      if (res?.error) {
        flip();
        setListError(res.error);
      }
    } catch (err) {
      flip();
      setListError(actionErrorMessage(err, "Could not change the gate. Please try again."));
    } finally {
      setToggling(null);
    }
  }

  function openCreate() {
    setEditingGate(null);
    setShowModal(true);
  }

  function openEdit(gate: any) {
    setEditingGate(gate);
    setShowModal(true);
  }

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
              <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100">
                Gate Management
              </h1>
              <p className="mt-1 text-sm text-zinc-500">{gatesList.length} gate(s) configured</p>
            </div>
            <Button onClick={openCreate} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Gate
            </Button>
          </div>
        </div>

        {gatesList.length === 0 ? (
          <Card>
            <EmptyState
              icon={<DoorOpen className="h-8 w-8" />}
              title="No Gates Configured"
              description="Add campus gates to enable movement registration."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Add First Gate
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {gatesList.map((gate) => (
              <Card key={gate.id} glow className="flex flex-col">
                <CardContent className="p-5 sm:p-6 flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          gate.active ? "bg-orange-500/10 text-orange-400" : "bg-zinc-950 text-zinc-500"
                        }`}
                      >
                        <DoorOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-medium text-zinc-100 truncate">{gate.name}</p>
                        {gate.location && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 min-w-0">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{gate.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={gate.active ? "success" : "danger"} className="shrink-0">
                      {gate.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/70 pt-4">
                      <p className="text-xs text-zinc-500">
                        Created {formatDate(gate.createdAt)}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(gate)} className="h-10 sm:h-9">
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(gate.id)}
                          loading={toggling === gate.id}
                          className={`h-10 sm:h-9 ${gate.active ? "text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/40" : "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/40"}`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {gate.active ? "Disable" : "Enable"}
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setError(null); setEditingGate(null); }} title={editingGate ? "Edit Gate" : "Add New Gate"}>
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
          <Input name="name" label="Gate Name *" placeholder="e.g., Main Gate, Back Gate" defaultValue={editingGate?.name || ""} required id="gate-name" />
          <Input name="location" label="Location" placeholder="e.g., North Campus Entrance" defaultValue={editingGate?.location || ""} id="gate-location" />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { setShowModal(false); setError(null); setEditingGate(null); }}>Cancel</Button>
            <Button type="submit" loading={loading} className="w-full sm:w-auto">
              {editingGate ? "Save Changes" : <><Plus className="h-4 w-4" />Create Gate</>}
            </Button>
          </div>
        </form>
      </Modal>

    </>
  );
}
