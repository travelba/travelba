"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { billingCompanyTabLabel } from "@/lib/crm/billing-companies";
import { defaultBillingCompany } from "@/lib/crm/payer";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { fieldControlClass, DateFrInput } from "@/components/crm/fields";
import { PlaceField } from "@/components/crm/PlaceField";
import { BusyBar } from "@/components/crm/BusyBar";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";

export function NewBookingForm({
  customers,
  companies = [],
  aiConfigured,
}: {
  customers: CrmCustomer[];
  companies?: { id: string; customer_id: string; company_name: string | null; sort_order: number }[];
  aiConfigured: boolean;
}) {
  const [manual, setManual] = useState(false);

  return (
    <div className="space-y-3">
      <BookingIngest
        role="admin"
        mode="create"
        customers={customers}
        ingestUrl="/api/admin/bookings/ingest"
        saveUrl="/api/admin/bookings/from-ingest"
        aiConfigured={aiConfigured}
        redirectTo={(booking) => `/admin/reservations/${booking.id}`}
      />
      <button
        type="button"
        className="text-xs font-semibold text-[var(--admin-navy)] underline"
        onClick={() => setManual((v) => !v)}
      >
        {manual ? "Masquer la saisie manuelle" : "Saisie manuelle (sans document)"}
      </button>
      {manual ? <ManualNewBookingForm customers={customers} companies={companies} /> : null}
    </div>
  );
}

function ManualNewBookingForm({
  customers,
  companies,
}: {
  customers: CrmCustomer[];
  companies: { id: string; customer_id: string; company_name: string | null; sort_order: number }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [clientSettles, setClientSettles] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [payerKind, setPayerKind] = useState<"company" | "personal">("personal");
  const [companyId, setCompanyId] = useState("");
  const walletId = (() => {
    const customer = customers.find((row) => row.id === customerId);
    return customer ? resolveBillingCustomerId(customer) : "";
  })();
  const walletCompanies = companies
    .filter((company) => company.customer_id === walletId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const defaultCompany = defaultBillingCompany(walletCompanies);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          include_in_ledger: fd.get("client_settles_stay") === "on" ? false : fd.get("include_in_ledger") === "on",
          agency_commission: fd.get("agency_commission") === "on",
          client_settles_stay: fd.get("client_settles_stay") === "on",
          payer_kind: payerKind,
          billing_company_id: payerKind === "company" ? companyId || defaultCompany?.id || null : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssues(issuesFromResponse(json));
        setError(null);
        return;
      }
      router.push(`/admin/reservations/${json.booking.id}`);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-3">
      <label className={`${labelClass} sm:col-span-3`}>
        Client
        <select
          name="customer_id"
          required
          disabled={saving}
          value={customerId}
          onChange={(event) => {
            const nextId = event.target.value;
            setCustomerId(nextId);
            const customer = customers.find((row) => row.id === nextId);
            const wallet = customer ? resolveBillingCustomerId(customer) : "";
            const list = companies
              .filter((company) => company.customer_id === wallet)
              .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
            const first = defaultBillingCompany(list);
            if (first) {
              setPayerKind("company");
              setCompanyId(first.id);
            } else {
              setPayerKind("personal");
              setCompanyId("");
            }
          }}
          className={`${fieldControlClass} bg-white`}
        >
          <option value="">Choisir un client…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
      {c.last_name} {c.first_name} — {c.email}
              {c.company_role === "member" ? " · rattaché" : ""}
              {c.company_role === "admin" ? " · admin société" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Titre du voyage
        <input name="title" required disabled={saving} placeholder="Ex. Séjour à Bali" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Destination
        <PlaceField name="destination" disabled={saving} className={fieldControlClass} />
      </label>
      <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2" role="radiogroup" aria-label="Qui règle ce voyage">
        {(
          [
            { kind: "company" as const, title: "Société", hint: "Une société du compte règle ce voyage." },
            {
              kind: "personal" as const,
              title: "Particulier",
              hint: "Le client règle depuis son espace : carte, Apple Pay, prélèvement SEPA, virement.",
            },
          ]
        ).map((choice) => {
          const selected = payerKind === choice.kind;
          const blocked = choice.kind === "company" && !walletCompanies.length;
          return (
            <button
              key={choice.kind}
              type="button"
              aria-pressed={selected}
              disabled={saving || blocked || !customerId}
              onClick={() => {
                setPayerKind(choice.kind);
                if (choice.kind === "company") setCompanyId((current) => current || defaultCompany?.id || "");
              }}
              className={`rounded-2xl border p-3 text-left ${
                selected ? "border-[var(--admin-gold)] bg-white" : "border-[#e5e3dc] bg-white/70"
              }`}
            >
              <span className="font-display text-sm font-bold text-[var(--admin-navy)]">{choice.title}</span>
              <span className="mt-1 block text-xs text-muted">{choice.hint}</span>
            </button>
          );
        })}
      </div>
      {payerKind === "company" && walletCompanies.length > 1 ? (
        <label className={`${labelClass} sm:col-span-3`}>
          Société qui règle
          <select
            value={companyId}
            disabled={saving}
            onChange={(event) => setCompanyId(event.target.value)}
            className={`${fieldControlClass} bg-white`}
            aria-label="Société qui règle le voyage"
          >
            {walletCompanies.map((company, index) => (
              <option key={company.id} value={company.id}>
                {billingCompanyTabLabel(company.company_name, index, walletCompanies.length)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {payerKind === "company" && walletCompanies.length === 1 ? (
        <p className="text-sm text-[var(--admin-navy)] sm:col-span-3">
          Société : {billingCompanyTabLabel(walletCompanies[0].company_name, 0, 1)}
        </p>
      ) : null}
      <p className="text-xs text-muted sm:col-span-3">
        Le montant du séjour sera la somme des prix vendus des cartes.
      </p>
      <label className="flex items-start gap-2 text-sm font-semibold text-[var(--admin-navy)] sm:col-span-3">
        <input
          type="checkbox"
          name="client_settles_stay"
          checked={clientSettles}
          onChange={(event) => setClientSettles(event.target.checked)}
          className="mt-1"
          disabled={saving}
        />
        <span>
          Le client règle ce séjour
          <span className="mt-0.5 block text-xs font-normal text-muted">
            L’hôtel est payé sur sa carte. Le montant reste au carnet et sort des transactions et de l’encours.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm font-semibold text-[var(--admin-navy)] sm:col-span-3">
        <input
          key={clientSettles ? "stay-out" : "stay-in"}
          type="checkbox"
          name="include_in_ledger"
          defaultChecked={!clientSettles}
          className="mt-1"
          disabled={saving || clientSettles}
        />
        <span>
          Inclure le montant du séjour dans les transactions
          <span className="mt-0.5 block text-xs font-normal text-muted">
            {clientSettles
              ? "Le client règle ce séjour : ce montant ne va pas aux transactions."
              : "Décochez pour un dossier au carnet sans écriture à l’encours."}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm font-semibold text-[var(--admin-navy)] sm:col-span-3">
        <input type="checkbox" name="agency_commission" className="mt-1" disabled={saving} />
        <span>
          Appliquer la commission de 10 %
          <span className="mt-0.5 block text-xs font-normal text-muted">
            Ajoute 10 % du montant du séjour aux dépenses. Le virement reçu reste crédité en entier.
          </span>
        </span>
      </label>
      <label className={labelClass}>
        Départ
        <DateFrInput name="start_date" aria-label="Date de départ" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Retour
        <DateFrInput name="end_date" aria-label="Date de retour" className={fieldControlClass} />
      </label>
      <div className="sm:col-span-3">
        <IssuesList issues={issues} />
        {error && !issues.length ? <p className="text-sm text-accent">{error}</p> : null}
      </div>
      <div className="sm:col-span-3">
        <BusyBar active={saving} label="Création…" />
      </div>
      <button type="submit" disabled={saving} className="admin-af-btn admin-tap rounded-xl px-4 py-2.5 text-sm sm:col-span-3">
        {saving ? "Création…" : "Créer la réservation"}
      </button>
    </form>
  );
}
