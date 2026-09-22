"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { companyDisplayName } from "@/lib/crm/company-role";
import { Field, fieldControlClass } from "@/components/crm/fields";

export function CreateBillingCompanyPanel({ traveler }: { traveler: CrmCustomer }) {
  const router = useRouter();
  const companyName = companyDisplayName(traveler);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(traveler.company_name || "");
  const [rebill, setRebill] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${traveler.id}/billing-company`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        company_name: name,
        rebill_open_bookings: rebill,
        invite: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Impossible d’ouvrir le compte société.");
      return;
    }
    const companyId = json.company?.id as string | undefined;
    if (companyId) router.push(`/admin/clients/${companyId}`);
    else router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-3xl p-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Compte de facturation
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
          Ouvrir le compte {companyName}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Le gérant devient le wallet société : il voyage aussi, voit le grand livre, et paie les
          dossiers des collaborateurs. Ce voyageur ne verra jamais le solde {companyName}.
          L’e-mail du gérant est obligatoire — on ne crée pas de fiche sans.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom du gérant">
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={fieldControlClass}
            autoComplete="off"
            placeholder="Cyril"
          />
        </Field>
        <Field label="Nom du gérant">
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={fieldControlClass}
            autoComplete="off"
            placeholder="Zeitoun"
          />
        </Field>
        <Field label="E-mail du gérant" hint="Identifiant de connexion. Créer ≠ inviter.">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldControlClass}
            autoComplete="off"
            placeholder="gerant@exemple.fr"
          />
        </Field>
        <Field label="Téléphone (optionnel)">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldControlClass}
            autoComplete="off"
          />
        </Field>
        <Field label="Société" className="sm:col-span-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldControlClass}
            autoComplete="off"
          />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
        <input
          type="checkbox"
          checked={rebill}
          onChange={(e) => setRebill(e.target.checked)}
          className="mt-1"
        />
        <span>
          Reprendre les dossiers encore facturés à ce voyageur
          <span className="mt-0.5 block text-xs font-normal text-muted">
            Ex. un Marrakech déjà confirmé passe sur le wallet {companyName}.
          </span>
        </span>
      </label>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <button className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={saving}>
        {saving ? "Création…" : `Créer le compte ${name.trim() || companyName}`}
      </button>
    </form>
  );
}
