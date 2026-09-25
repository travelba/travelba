"use client";

import { useState } from "react";
import { billingCompanyTabLabel } from "@/lib/crm/billing-companies";
import type { CrmBillingCompany } from "@/lib/crm/types";
import {
  billingJson,
  billingSameAsProfile,
  companyBillingFromCustomer,
  CompanyBillingFields,
  type CompanyBillingValues,
  type ProfileAddress,
} from "@/components/crm/CompanyBillingFields";

export type BillingCompanyDraft = {
  key: string;
  id: string | null;
  values: CompanyBillingValues;
  sameAsProfile: boolean;
};

function draftKey() {
  return `societe-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyBillingCompanyDraft(): BillingCompanyDraft {
  return {
    key: draftKey(),
    id: null,
    values: companyBillingFromCustomer({}),
    sameAsProfile: true,
  };
}

export function billingCompanyDrafts(
  companies: CrmBillingCompany[],
  legacy: Parameters<typeof companyBillingFromCustomer>[0] | null,
  profile: ProfileAddress
): BillingCompanyDraft[] {
  if (companies.length) {
    return [...companies]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((company) => {
        const values = companyBillingFromCustomer(company);
        return {
          key: company.id,
          id: company.id,
          values,
          sameAsProfile: billingSameAsProfile(values, profile),
        };
      });
  }
  const values = companyBillingFromCustomer(legacy || {});
  const hasLegacy = Boolean(
    values.companyName || values.siret || values.vatNumber || values.billingEmail || values.billingLine
  );
  if (!hasLegacy) return [];
  return [
    {
      key: draftKey(),
      id: null,
      values,
      sameAsProfile: billingSameAsProfile(values, profile),
    },
  ];
}

export function billingCompaniesPayload(drafts: BillingCompanyDraft[], profile: ProfileAddress) {
  return drafts.map((draft) => ({
    id: draft.id,
    ...billingJson(draft.values, profile, draft.sameAsProfile),
  }));
}

export function BillingCompaniesTabs({
  drafts,
  onChange,
  profileAddress,
}: {
  drafts: BillingCompanyDraft[];
  onChange: (next: BillingCompanyDraft[]) => void;
  profileAddress: ProfileAddress;
}) {
  const [active, setActive] = useState(0);
  const index = drafts.length ? Math.min(active, drafts.length - 1) : 0;
  const current = drafts[index];

  function updateCurrent(partial: Partial<BillingCompanyDraft>) {
    onChange(drafts.map((draft, i) => (i === index ? { ...draft, ...partial } : draft)));
  }

  if (!drafts.length) {
    return (
      <button
        type="button"
        onClick={() => {
          onChange([emptyBillingCompanyDraft()]);
          setActive(0);
        }}
        className="w-full rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3 text-left text-sm font-semibold text-[var(--admin-navy)]"
      >
        Ajouter une société
      </button>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="font-display text-base font-bold text-[var(--admin-navy)]">Sociétés de facturation</p>
        <p className="mt-1 text-sm text-muted">
          Plusieurs sociétés peuvent figurer sur ce compte. L’encours reste global.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sociétés de facturation">
        {drafts.map((draft, i) => (
          <button
            key={draft.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setActive(i)}
            className={
              i === index
                ? "rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-[#e5e3dc] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
            }
          >
            {billingCompanyTabLabel(draft.values.companyName, i, drafts.length)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onChange([...drafts, emptyBillingCompanyDraft()]);
            setActive(drafts.length);
          }}
          className="rounded-full border border-dashed border-[var(--admin-gold)] px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Ajouter une société
        </button>
      </div>
      {current ? (
        <div role="tabpanel" className="space-y-3">
          <CompanyBillingFields
            heading={false}
            values={current.values}
            onChange={(values) => updateCurrent({ values })}
            sameAsProfile={current.sameAsProfile}
            onSameAsProfileChange={(sameAsProfile) => updateCurrent({ sameAsProfile })}
            profileAddress={profileAddress}
          />
          <button
            type="button"
            onClick={() => {
              const next = drafts.filter((_, i) => i !== index);
              onChange(next);
              setActive(Math.max(0, index - 1));
            }}
            className="text-sm font-semibold text-accent"
          >
            Retirer cette société
          </button>
        </div>
      ) : null}
    </section>
  );
}
