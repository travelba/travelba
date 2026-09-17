"use client";

import {
  formatSiretInput,
  normalizeSiret,
  siretError,
  siretFieldError,
  vatFromSiret,
} from "@/lib/crm/billing";
import { AddressFields, Field, fieldControlClass } from "@/components/crm/fields";

export type CompanyBillingValues = {
  companyName: string;
  siret: string;
  vatNumber: string;
  billingEmail: string;
  billingCountry: string;
  billingLine: string;
  billingPostal: string;
  billingCity: string;
};

export function companyBillingFromCustomer(customer: {
  company_name?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  billing_email?: string | null;
  billing_country?: string | null;
  billing_address_line?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
}): CompanyBillingValues {
  return {
    companyName: customer.company_name || "",
    siret: customer.siret ? formatSiretInput(customer.siret) : "",
    vatNumber: customer.vat_number || "",
    billingEmail: customer.billing_email || "",
    billingCountry: customer.billing_country || "",
    billingLine: customer.billing_address_line || "",
    billingPostal: customer.billing_postal_code || "",
    billingCity: customer.billing_city || "",
  };
}

export function billingSameAsProfile(
  billing: CompanyBillingValues,
  profile: { country: string; line: string; postal: string; city: string }
) {
  const hasBilling = Boolean(
    billing.billingLine || billing.billingPostal || billing.billingCity || billing.billingCountry
  );
  if (!hasBilling) return true;
  return (
    (billing.billingLine || "") === (profile.line || "") &&
    (billing.billingPostal || "") === (profile.postal || "") &&
    (billing.billingCity || "") === (profile.city || "") &&
    (billing.billingCountry || "FR") === (profile.country || "FR")
  );
}

export function billingJson(
  values: CompanyBillingValues,
  profile: { country: string; line: string; postal: string; city: string },
  sameAsProfile: boolean
) {
  const hasCompany = Boolean(
    values.companyName.trim() ||
      values.siret.trim() ||
      values.vatNumber.trim() ||
      values.billingEmail.trim() ||
      (!sameAsProfile && (values.billingLine.trim() || values.billingPostal.trim() || values.billingCity.trim()))
  );
  if (!hasCompany) {
    return {
      company_name: values.companyName,
      siret: values.siret,
      vat_number: values.vatNumber,
      billing_email: values.billingEmail,
      billing_address_line: values.billingLine,
      billing_postal_code: values.billingPostal,
      billing_city: values.billingCity,
      billing_country: values.billingCountry,
    };
  }
  return {
    company_name: values.companyName,
    siret: values.siret,
    vat_number: values.vatNumber,
    billing_email: values.billingEmail,
    billing_address_line: sameAsProfile ? profile.line : values.billingLine,
    billing_postal_code: sameAsProfile ? profile.postal : values.billingPostal,
    billing_city: sameAsProfile ? profile.city : values.billingCity,
    billing_country: sameAsProfile ? profile.country : values.billingCountry,
  };
}

export function CompanyBillingFields({
  values,
  onChange,
  sameAsProfile,
  onSameAsProfileChange,
  profileAddress,
}: {
  values: CompanyBillingValues;
  onChange: (next: CompanyBillingValues) => void;
  sameAsProfile: boolean;
  onSameAsProfileChange: (same: boolean) => void;
  profileAddress: { country: string; line: string; postal: string; city: string };
}) {
  const siretDigits = normalizeSiret(values.siret);
  const siretHint = siretFieldError(siretDigits);

  function update(partial: Partial<CompanyBillingValues>) {
    onChange({ ...values, ...partial });
  }

  function onSiret(raw: string) {
    const formatted = formatSiretInput(raw);
    const digits = normalizeSiret(formatted);
    const next: Partial<CompanyBillingValues> = { siret: formatted };
    if (digits && !siretError(digits) && !values.vatNumber) {
      const vat = vatFromSiret(digits);
      if (vat) next.vatNumber = vat;
    }
    update(next);
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="font-display text-base font-bold text-[var(--admin-navy)]">
          Facturation société
        </p>
        <p className="mt-1 text-sm text-muted">
          Raison sociale, SIRET et adresse à faire figurer sur les factures.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Raison sociale" className="sm:col-span-2">
          <input
            value={values.companyName}
            onChange={(event) => update({ companyName: event.target.value })}
            autoComplete="organization"
            className={fieldControlClass}
            placeholder="Société, holding ou nom commercial"
          />
        </Field>
        <Field label="SIRET" error={siretHint} hint={!siretHint ? "14 chiffres" : undefined}>
          <input
            value={values.siret}
            onChange={(event) => onSiret(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className={fieldControlClass}
            placeholder="000 000 000 00000"
          />
        </Field>
        <Field label="N° TVA intracommunautaire">
          <input
            value={values.vatNumber}
            onChange={(event) => update({ vatNumber: event.target.value.toUpperCase() })}
            autoComplete="off"
            className={fieldControlClass}
            placeholder="FRXX000000000"
          />
        </Field>
        <Field label="Email de facturation" className="sm:col-span-2">
          <input
            type="email"
            value={values.billingEmail}
            onChange={(event) => update({ billingEmail: event.target.value })}
            autoComplete="email"
            className={fieldControlClass}
            placeholder="compta@societe.fr"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
        <input
          type="checkbox"
          checked={sameAsProfile}
          onChange={(event) => {
            const same = event.target.checked;
            onSameAsProfileChange(same);
            if (!same) {
              update({
                billingCountry: values.billingCountry || profileAddress.country || "FR",
                billingLine: values.billingLine || profileAddress.line,
                billingPostal: values.billingPostal || profileAddress.postal,
                billingCity: values.billingCity || profileAddress.city,
              });
            }
          }}
        />
        Adresse de facturation identique à l’adresse du voyageur
      </label>
      {sameAsProfile ? null : (
        <AddressFields
          namePrefix="billing"
          country={values.billingCountry || "FR"}
          onCountryChange={(country) => update({ billingCountry: country })}
          line={values.billingLine}
          postal={values.billingPostal}
          city={values.billingCity}
          onLineChange={(line) => update({ billingLine: line })}
          onPostalChange={(postal) => update({ billingPostal: postal })}
          onCityChange={(city) => update({ billingCity: city })}
        />
      )}
    </section>
  );
}
