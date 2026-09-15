"use client";

import { FormEvent, useState } from "react";

type Staff = { id: string; full_name: string; role: "admin" | "agent"; active: boolean; permissions: Record<string, boolean> };
const CAPABILITIES = [
  ["bookings", "Réservations"],
  ["quotes", "Devis"],
  ["finance", "Finance"],
  ["operations", "Opérations"],
  ["suppliers", "Fournisseurs"],
  ["mtrip", "mTrip"],
] as const;

export function TeamManager({ initialStaff, canAdmin }: { initialStaff: Staff[]; canAdmin: boolean }) {
  const [staff, setStaff] = useState(initialStaff);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: form.get("full_name"), email: form.get("email"), role: form.get("role") }) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(data.error || "Invitation impossible");
    setStaff((rows) => [...rows.filter((row) => row.id !== data.staff.id), data.staff]);
    event.currentTarget.reset();
    setMessage("Invitation envoyée.");
  }

  async function update(row: Staff, patch: Partial<Staff>) {
    const response = await fetch("/api/admin/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, ...patch }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || "Modification impossible");
    setStaff((rows) => rows.map((item) => item.id === row.id ? data.staff : item));
    setMessage("Accès mis à jour.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">{staff.map((member) => <article key={member.id} className="admin-af-card p-5"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{member.full_name}</p><p className="text-xs text-muted">{member.active ? "Actif" : "Désactivé"}</p></div><div className="flex gap-2"><select disabled={!canAdmin} value={member.role} onChange={(event) => void update(member, { role: event.target.value as Staff["role"] })} className="rounded-lg border border-border px-2 py-1 text-xs"><option value="agent">Agent</option><option value="admin">Admin</option></select><button disabled={!canAdmin} onClick={() => void update(member, { active: !member.active })} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold">{member.active ? "Désactiver" : "Activer"}</button></div></div>{member.role === "agent" ? <div className="mt-4 flex flex-wrap gap-2">{CAPABILITIES.map(([key, label]) => <label key={key} className="rounded-full border border-border px-3 py-1 text-xs"><input type="checkbox" className="mr-1.5" disabled={!canAdmin} checked={member.permissions?.[key] === true} onChange={(event) => void update(member, { permissions: { ...member.permissions, [key]: event.target.checked } })} />{label}</label>)}</div> : null}</article>)}</div>
      {canAdmin ? <form onSubmit={invite} className="admin-af-card h-fit space-y-4 p-5"><h2 className="font-display text-lg font-bold">Inviter un agent</h2><input name="full_name" required placeholder="Nom complet" className="w-full rounded-xl border border-border px-3 py-2" /><input name="email" type="email" required placeholder="E-mail" className="w-full rounded-xl border border-border px-3 py-2" /><select name="role" className="w-full rounded-xl border border-border px-3 py-2"><option value="agent">Agent</option><option value="admin">Administrateur</option></select><button disabled={pending} className="admin-af-btn w-full rounded-full px-4 py-2.5 text-sm">{pending ? "Invitation…" : "Envoyer l’invitation"}</button>{message ? <p role="status" className="text-sm text-muted">{message}</p> : null}</form> : null}
    </div>
  );
}
