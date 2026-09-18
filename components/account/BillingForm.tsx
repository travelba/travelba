"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/client/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(billingJson(billing, profileAddress, sameBillingAddress)),
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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <CompanyBillingFields
        values={billing}
        onChange={setBilling}
        sameAsProfile={sameBillingAddress}
        onSameAsProfileChange={setSameBillingAddress}
        profileAddress={profileAddress}
      />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {saved ? <p className="text-sm text-[var(--admin-navy)]">Enregistré.</p> : null}
      <button className="admin-af-btn rounded-full px-5 py-2.5 text-sm" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
