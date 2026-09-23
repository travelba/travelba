"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import { formatIbanInput, ibanError, normalizeIban } from "@/lib/crm/billing";
import { Field, fieldControlClass } from "@/components/crm/fields";
import { BusyBar } from "@/components/crm/BusyBar";
import {
  billingJson,
  billingSameAsProfile,
  companyBillingFromCustomer,
  CompanyBillingFields,
  type CompanyBillingValues,
} from "@/components/crm/CompanyBillingFields";

export function BillingForm({ customer }: { customer: CrmCustomer }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [iban, setIban] = useState(() => formatIbanInput(customer.iban || ""));
  const [billing, setBilling] = useState<CompanyBillingValues>(() =>
    companyBillingFromCustomer(customer)
  );
  const profileAddress = {
    country: resolveCountryCode(customer.country) || "FR",
    line: customer.address_line || "",
    postal: customer.postal_code || "",
    city: customer.city || "",
  };
  const [sameBillingAddress, setSameBillingAddress] = useState(() =>
    billingSameAsProfile(companyBillingFromCustomer(customer), profileAddress)
  );
  const ibanHint = ibanError(normalizeIban(iban));
  const hasBilling = Boolean(
    normalizeIban(iban) ||
      billing.companyName ||
      billing.siret ||
      billing.vatNumber ||
      billing.billingEmail ||
      billing.billingLine
  );
  const [open, setOpen] = useState(hasBilling);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeIban(iban);
    const err = ibanError(normalized);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/client/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        iban: normalized,
        ...billingJson(billing, profileAddress, sameBillingAddress),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaving(false);
      setError(json.error || "Erreur");
      return;
    }
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3 text-left text-sm font-semibold text-[var(--admin-navy)]"
      >
        Ajouter un IBAN ou une société
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="IBAN" hint="Compte français, 27 caractères" error={ibanHint}>
        <input
          value={iban}
          onChange={(event) => setIban(formatIbanInput(event.target.value))}
          autoComplete="off"
          spellCheck={false}
          className={fieldControlClass}
          placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
        />
      </Field>
      <CompanyBillingFields
        values={billing}
        onChange={setBilling}
        sameAsProfile={sameBillingAddress}
        onSameAsProfileChange={setSameBillingAddress}
        profileAddress={profileAddress}
      />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <div className="sticky bottom-20 z-20 border-t border-[#e5e3dc] bg-[rgba(250,249,246,0.95)] py-3 backdrop-blur md:bottom-4">
        {saved ? <p className="mb-2 text-sm text-[var(--admin-navy)]">Enregistré.</p> : null}
        <BusyBar active={saving} label="Enregistrement…" />
        <button className="admin-af-btn w-full rounded-full px-5 py-2.5 text-sm" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
