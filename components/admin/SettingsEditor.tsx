"use client";

import { FormEvent, useState } from "react";

export function SettingsEditor({ initialIdentity, initialTemplates, canEdit }: {
  initialIdentity: Record<string, unknown>;
  initialTemplates: Record<string, unknown>;
  canEdit: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>, key: string, label: string) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const value = key === "agency_identity" ? {
      name: form.get("name"),
      legal_name: form.get("legal_name"),
      email: form.get("email"),
      phone: form.get("phone"),
      address: form.get("address"),
    } : {
      quote_subject: form.get("quote_subject"),
      quote_body: form.get("quote_body"),
      payment_subject: form.get("payment_subject"),
      payment_body: form.get("payment_body"),
    };
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        label,
        value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Paramètres enregistrés." : data.error || "Enregistrement impossible");
  }
  return (
    <div className="space-y-6">
    <form onSubmit={(event) => void save(event, "agency_identity", "Identité agence")} className="admin-af-card grid gap-4 p-5 md:grid-cols-2">
      <h2 className="font-display text-xl font-bold md:col-span-2">Identité agence</h2>
      {[
        ["name", "Nom commercial"],
        ["legal_name", "Raison sociale"],
        ["email", "E-mail"],
        ["phone", "Téléphone"],
      ].map(([name, label]) => <label key={name} className="text-sm font-semibold">{label}<input name={name} disabled={!canEdit} defaultValue={String(initialIdentity[name] || "")} className="mt-1 w-full rounded-xl border border-border px-3 py-2 font-normal disabled:bg-slate-50" /></label>)}
      <label className="text-sm font-semibold md:col-span-2">Adresse<textarea name="address" disabled={!canEdit} defaultValue={String(initialIdentity.address || "")} className="mt-1 min-h-20 w-full rounded-xl border border-border px-3 py-2 font-normal disabled:bg-slate-50" /></label>
      {message ? <p role="status" className="text-sm text-muted md:col-span-2">{message}</p> : null}
      {canEdit ? <button disabled={pending} className="admin-af-btn rounded-full px-4 py-2.5 text-sm">{pending ? "Enregistrement…" : "Enregistrer"}</button> : <p className="text-sm text-muted">Modification réservée aux administrateurs.</p>}
    </form>
    <form onSubmit={(event) => void save(event, "email_templates", "Modèles d’e-mails")} className="admin-af-card grid gap-4 p-5 md:grid-cols-2">
      <h2 className="font-display text-xl font-bold md:col-span-2">Modèles d’e-mails</h2>
      <label className="text-sm font-semibold">Objet devis<input name="quote_subject" disabled={!canEdit} defaultValue={String(initialTemplates.quote_subject || "Votre devis Travelba")} className="mt-1 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
      <label className="text-sm font-semibold">Objet échéance<input name="payment_subject" disabled={!canEdit} defaultValue={String(initialTemplates.payment_subject || "Votre échéance Travelba")} className="mt-1 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
      <label className="text-sm font-semibold">Message devis<textarea name="quote_body" disabled={!canEdit} defaultValue={String(initialTemplates.quote_body || "Bonjour {{prenom}}, votre devis {{reference}} est disponible.")} className="mt-1 min-h-24 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
      <label className="text-sm font-semibold">Message échéance<textarea name="payment_body" disabled={!canEdit} defaultValue={String(initialTemplates.payment_body || "Bonjour {{prenom}}, votre échéance de {{montant}} arrive à date.")} className="mt-1 min-h-24 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
      {canEdit ? <button disabled={pending} className="admin-af-btn rounded-full px-4 py-2.5 text-sm">{pending ? "Enregistrement…" : "Enregistrer les modèles"}</button> : null}
    </form>
    </div>
  );
}
