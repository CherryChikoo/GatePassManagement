"use client";

import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Modal, EmptyState } from "@/components/ui/primitives";
import { logoutAction } from "@/server/actions/auth";
import { createGate, updateGate, toggleGateActive } from "@/server/actions/admin";
import { formatDate } from "@/lib/utils";
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

  useEffect(() => {
    setGatesList(gates);
  }, [gates]);

  async function handleSave(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = editingGate 
      ? await updateGate(editingGate.id, formData)
      : await createGate(formData);
      
    if (result.error) {
      setError(result.error);
    } else {
      setShowModal(false);
      setEditingGate(null);
    }
    setLoading(false);
  }

  async function handleToggle(id: string) {
    setToggling(id);
    // Optimistic toggle
    setGatesList((prev) =>
      prev.map((g) => (g.id === id ? { ...g, active: !g.active } : g))
    );
    await toggleGateActive(id);
    setToggling(null);
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
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <BackButton href="/admin" label="Back to Dashboard" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Gate Management
            </h1>
            <p className="text-sm text-zinc-500 mt-1">{gatesList.length} gate(s) configured</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Gate
          </Button>
        </div>

        {gatesList.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gatesList.map((gate) => (
              <Card key={gate.id} glow>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-violet-500/15 p-2.5 text-violet-400">
                        <DoorOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-200">{gate.name}</p>
                        {gate.location && (
                          <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            {gate.location}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={gate.active ? "success" : "danger"}>
                      {gate.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between">
                    <p className="text-xs text-zinc-600">
                      Created {formatDate(gate.createdAt)}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(gate)} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-8 px-2">
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(gate.id)} loading={toggling === gate.id} className="h-8 px-2">
                        <Power className="h-3.5 w-3.5" />
                        {gate.active ? "Disable" : "Enable"}
                      </Button>
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}
          <Input name="name" label="Gate Name *" placeholder="e.g., Main Gate, Back Gate" defaultValue={editingGate?.name || ""} required id="gate-name" />
          <Input name="location" label="Location" placeholder="e.g., North Campus Entrance" defaultValue={editingGate?.location || ""} id="gate-location" />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => { setShowModal(false); setError(null); setEditingGate(null); }}>Cancel</Button>
            <Button type="submit" loading={loading}>
              {editingGate ? "Save Changes" : <><Plus className="h-4 w-4" />Create Gate</>}
            </Button>
          </div>
        </form>
      </Modal>
    
    </>
  );
}
