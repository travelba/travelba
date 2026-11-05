"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { Icon } from "@/components/crm/icons";
import { splitTypedClientName, type ReassignClientResult } from "@/lib/crm/reassign-booking-client";
import { useIsClient } from "@/lib/crm/use-is-client";
import type { PickableCustomer } from "@/lib/crm/customer-search";

type Draft = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_name: string;
};

const EMPTY: Draft = { first_name: "", last_name: "", email: "", phone: "", company_name: "" };

export function ChangeBookingClient({ bookingId, onChanged }: { bookingId: string; onChanged: () => void }) {
  const mounted = useIsClient();
  const titleId = useId();
  const [search, setSearch] = useState(false);
  const [customers, setCustomers] = useState<PickableCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<ReassignClientResult | null>(null);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openSearch() {
    setError(null);
    setSearch(true);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients?pick=1");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearch(false);
        setError(typeof json.error === "string" ? json.error : "Recherche clients impossible.");
        return;
      }
      setCustomers(Array.isArray(json.customers) ? (json.customers as PickableCustomer[]) : []);
    } catch {
      setSearch(false);
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  async function ask(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Changement impossible.");
        return null;
      }
      return json as ReassignClientResult;
    } catch {
      setError("Connexion interrompue. Réessayez.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function choose(customer: PickableCustomer) {
    const body = { customer_id: customer.id };
    const result = await ask(body);
    if (!result) {
      setSearch(false);
      return;
    }
    setSearch(false);
    setDraft(null);
    setPending(body);
    setPreview(result);
  }

  function startCreate(query: string) {
    const names = splitTypedClientName(query);
    setSearch(false);
    setError(null);
    setDraft({ ...EMPTY, first_name: names.firstName, last_name: names.lastName });
  }

  async function submitCreate() {
    if (!draft) return;
    const body = { creer: draft };
    const result = await ask(body);
    if (!result) return;
    setDraft(null);
    setPending(body);
    setPreview(result);
  }

  async function confirm() {
    if (!pending) return;
    const result = await ask({ ...pending, confirmer: true });
    if (!result?.applique) return;
    setPreview(null);
    setPending(null);
    onChanged();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openSearch()}
        className="admin-tap shrink-0 rounded-full border border-[var(--admin-navy)] px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
      >
        Changer de client
      </button>
      {error && !search && !draft && !preview ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <CustomerPickDialog
        open={search}
        customers={customers}
        title={loading ? "C’est un autre client…" : "C’est un autre client"}
        createLabel="Créer un nouveau client"
        onSelect={(customer) => void choose(customer)}
        onCreate={startCreate}
        onClose={() => setSearch(false)}
      />
      {draft && mounted
        ? createPortal(
            <div className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center">
              <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="w-full max-w-lg space-y-4 rounded-3xl border border-[#e8e4dc] bg-white p-5 text-[#1a1c1a] shadow-2xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void submitCreate();
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
                      Créer un nouveau client
                    </p>
                    <p className="mt-0.5 text-sm text-[#44474c]">Aucune invitation. Le dossier lui sera rattaché après confirmation.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-[#0b192c] hover:bg-[#f3f1ea]"
                    aria-label="Fermer"
                  >
                    <Icon name="close" className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prénom" value={draft.first_name} onChange={(first_name) => setDraft({ ...draft, first_name })} />
                  <Field label="Nom" value={draft.last_name} onChange={(last_name) => setDraft({ ...draft, last_name })} />
                  <Field label="E-mail" value={draft.email} onChange={(email) => setDraft({ ...draft, email })} optional />
                  <Field label="Téléphone" value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} optional />
                  <Field
                    label="Société"
                    value={draft.company_name}
                    onChange={(company_name) => setDraft({ ...draft, company_name })}
                    optional
                    className="sm:col-span-2"
                  />
                </div>
                {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-[#e8e4dc] px-4 py-2 text-sm font-semibold">
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-[#0b192c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Vérification…" : "Continuer"}
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
      {preview && mounted
        ? createPortal(
            <div className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${titleId}-confirm`}
                className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-[#e8e4dc] bg-white p-5 text-[#1a1c1a] shadow-2xl"
              >
                <p id={`${titleId}-confirm`} className="font-display text-lg font-bold text-[#0b192c]">
                  {preview.creation ? "Créer la fiche et rattacher le dossier" : "Changer le client du dossier"}
                </p>
                {preview.doublons.length ? (
                  <div className="rounded-2xl bg-[#f5ece0] px-4 py-3 text-sm text-[#0b192c]">
                    <p className="font-semibold">Une fiche ressemble déjà à celle-ci.</p>
                    <ul className="mt-2 space-y-1">
                      {preview.doublons.map((row) => (
                        <li key={row.id}>
                          {row.nom}
                          {[row.email, row.telephone, row.societe].filter(Boolean).length
                            ? ` — ${[row.email, row.telephone, row.societe].filter(Boolean).join(" · ")}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">Créez seulement si c’est bien une autre personne.</p>
                  </div>
                ) : null}
                <ul className="space-y-2 text-sm text-[#0b192c]">
                  {preview.resume.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setPending(null);
                    }}
                    className="rounded-full border border-[#e8e4dc] px-4 py-2 text-sm font-semibold"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirm()}
                    className="rounded-full bg-[#0b192c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Rattachement…" : preview.creation ? "Créer et rattacher" : "Rattacher ce dossier"}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  optional = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-semibold text-[#0b192c] ${className}`}>
      <span>
        {label}
        {optional ? <span className="ml-1 font-normal text-[#44474c]">facultatif</span> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={!optional}
        className="rounded-xl border border-[#e8e4dc] bg-[#f3f1ea] px-3 py-2.5 text-sm font-normal text-[#0b192c] outline-none"
        autoComplete="off"
      />
    </label>
  );
}
