"use client";

import { useState } from "react";
import { mb3mCompanyButtons, type Mb3mCompanyInput } from "@/lib/crm/mb3m-companies";

export function Mb3mFicheAction({
  customerId,
  blocker,
  sent,
  companies = [],
  sentCompanyIds = [],
}: {
  customerId: string;
  blocker: string | null;
  sent: boolean;
  companies?: Mb3mCompanyInput[];
  sentCompanyIds?: string[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [knownPerson, setKnownPerson] = useState(sent);
  const [knownCompanies, setKnownCompanies] = useState(() => new Set(sentCompanyIds));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const rows = mb3mCompanyButtons(companies);

  async function send(companyId: string | null) {
    const key = companyId || "person";
    setBusyId(key);
    setNotes((current) => ({ ...current, [key]: "" }));
    try {
      const res = await fetch(`/api/admin/clients/${customerId}/mb3m`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyId ? { company_id: companyId } : { person_only: true }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; updated?: boolean } | null;
      if (!res.ok) {
        setNotes((current) => ({ ...current, [key]: json?.error || "La fiche MB3M n’a pas abouti." }));
        return;
      }
      const already = companyId ? knownCompanies.has(companyId) : knownPerson;
      const note = json?.updated || already ? "Fiche mise à jour dans MB3M." : "Fiche envoyée dans MB3M.";
      setNotes((current) => ({ ...current, [key]: note }));
      if (companyId) setKnownCompanies((current) => new Set(current).add(companyId));
      else setKnownPerson(true);
    } catch {
      setNotes((current) => ({ ...current, [key]: "La fiche MB3M n’a pas abouti." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-af-card space-y-3 rounded-3xl px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">MB3M</p>
      <p className="text-sm text-muted">
        {rows.length
          ? "Chaque société a son bouton. Le client part avec le sien. Rien ne part à l’enregistrement."
          : "Envoie la fiche dans MB3M. Rien ne part à l’enregistrement."}
      </p>
      <p className="text-sm text-muted">
        Le SIRET, le numéro de TVA et le lien du contact de la société se saisissent à la main dans MB3M. L’API ne les
        transporte pas.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busyId !== null || Boolean(blocker)}
          onClick={() => void send(null)}
          className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:border-[var(--border)] disabled:opacity-50"
        >
          {busyId === "person" ? "Envoi…" : "Créer dans MB3M"}
        </button>
        {blocker ? <p className="text-sm text-muted">{blocker}</p> : <p className="text-sm text-[var(--admin-navy)]">Client</p>}
      </div>
      {notes.person ? <p className="text-sm text-[var(--admin-navy)]">{notes.person}</p> : null}
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((company) => (
            <li key={company.id} className="space-y-2">
              <p className="text-sm text-[var(--admin-navy)]">
                {company.name} — SIRET {company.siret || "non renseigné"} — TVA {company.vat || "non renseigné"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busyId !== null || !company.ready}
                  onClick={() => void send(company.id)}
                  className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:border-[var(--border)] disabled:opacity-50"
                >
                  {busyId === company.id ? "Envoi…" : "Créer dans MB3M"}
                </button>
                {company.reason ? <p className="text-sm text-muted">{company.reason}</p> : null}
              </div>
              {notes[company.id] ? <p className="text-sm text-[var(--admin-navy)]">{notes[company.id]}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
