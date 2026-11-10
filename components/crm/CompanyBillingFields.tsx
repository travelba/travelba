"use client";

import { useState } from "react";
import {
  formatSiretInput,
  isForeignBillingCountry,
  normalizeSiret,
  siretError,
  siretFieldError,
  vatFromSiret,
} from "@/lib/crm/billing";
import type { OfficialCompany } from "@/lib/crm/entreprises";
import { AddressFields, Field, fieldControlClass } from "@/components/crm/fields";
import { useCompanySuggest } from "@/components/crm/CompanyLookup";

export type CompanyBillingValues = {
  companyName: string;
  siret: string;
  registrationNumber: string;
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
  registration_number?: string | null;
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
    registrationNumber: customer.registration_number || "",
    vatNumber: customer.vat_number || "",
    billingEmail: customer.billing_email || "",
    billingCountry: customer.billing_country || "",
    billingLine: customer.billing_address_line || "",
    billingPostal: customer.billing_postal_code || "",
    billingCity: customer.billing_city || "",
  };
}

export type ProfileAddress = {
  country: string;
  line: string;
  postal: string;
  city: string;
};

export function billingAddressDisplay(
  values: CompanyBillingValues,
  profile: ProfileAddress,
  sameAsProfile: boolean
): ProfileAddress {
  if (sameAsProfile) {
    return {
      country: profile.country || "FR",
      line: profile.line,
      postal: profile.postal,
      city: profile.city,
    };
  }
  return {
    country: values.billingCountry || "FR",
    line: values.billingLine,
    postal: values.billingPostal,
    city: values.billingCity,
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

/** Une frappe sur l’adresse de facturation la détache du domicile, dans le même état. */
export function billingAddressEdit(
  values: CompanyBillingValues,
  displayed: ProfileAddress,
  partial: Partial<ProfileAddress>
): { values: CompanyBillingValues; sameAsProfile: false } {
  const next = { ...displayed, ...partial };
  return {
    sameAsProfile: false,
    values: {
      ...values,
      billingCountry: next.country,
      billingLine: next.line,
      billingPostal: next.postal,
      billingCity: next.city,
    },
  };
}

export function billingJson(
  values: CompanyBillingValues,
  profile: { country: string; line: string; postal: string; city: string },
  sameAsProfile: boolean
) {
  const country = sameAsProfile ? profile.country : values.billingCountry;
  const foreign = isForeignBillingCountry(country);
  const hasCompany = Boolean(
    values.companyName.trim() ||
      values.siret.trim() ||
      values.registrationNumber.trim() ||
      values.vatNumber.trim() ||
      values.billingEmail.trim() ||
      (!sameAsProfile && (values.billingLine.trim() || values.billingPostal.trim() || values.billingCity.trim()))
  );
  const identity = {
    company_name: values.companyName,
    siret: foreign ? "" : values.siret,
    registration_number: foreign ? values.registrationNumber : "",
    vat_number: values.vatNumber,
    billing_email: values.billingEmail,
  };
  if (!hasCompany) {
    return {
      ...identity,
      billing_address_line: values.billingLine,
      billing_postal_code: values.billingPostal,
      billing_city: values.billingCity,
      billing_country: values.billingCountry,
    };
  }
  return {
    ...identity,
    billing_address_line: sameAsProfile ? profile.line : values.billingLine,
    billing_postal_code: sameAsProfile ? profile.postal : values.billingPostal,
    billing_city: sameAsProfile ? profile.city : values.billingCity,
    billing_country: country,
  };
}

export function CompanyBillingFields({
  values,
  onChange,
  sameAsProfile,
  profileAddress,
  heading = true,
}: {
  values: CompanyBillingValues;
  onChange: (next: CompanyBillingValues, patch?: { sameAsProfile?: boolean }) => void;
  sameAsProfile: boolean;
  profileAddress: { country: string; line: string; postal: string; city: string };
  heading?: boolean;
}) {
  const siretDigits = normalizeSiret(values.siret);
  const siretHint = siretFieldError(siretDigits);
  const [lookup, setLookup] = useState<string | null>(null);

  function update(partial: Partial<CompanyBillingValues>, patch?: { sameAsProfile?: boolean }) {
    onChange({ ...values, ...partial }, patch);
  }

  function pickCompany(company: OfficialCompany) {
    setLookup(null);
    onChange(
      {
        ...values,
        companyName: company.legalName,
        siret: formatSiretInput(company.siret),
        vatNumber: company.vat || vatFromSiret(company.siret) || "",
        billingCountry: "FR",
        billingLine: company.addressLine,
        billingPostal: company.postalCode,
        billingCity: company.city,
      },
      { sameAsProfile: false }
    );
  }

  const suggest = useCompanySuggest({ query: lookup ?? "", onPick: pickCompany });

  const address = billingAddressDisplay(values, profileAddress, sameAsProfile);
  const foreign = isForeignBillingCountry(address.country);

  function editAddress(partial: Partial<ProfileAddress>) {
    const next = billingAddressEdit(values, address, partial);
    if (isForeignBillingCountry(next.values.billingCountry)) setLookup(null);
    onChange(next.values, { sameAsProfile: next.sameAsProfile });
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
    setLookup(digits && digits.length >= 9 ? digits : null);
  }

  return (
    <section className="space-y-4">
      {heading ? (
        <div>
          <p className="font-display text-base font-bold text-[var(--admin-navy)]">
            Facturation société
          </p>
          <p className="mt-1 text-sm text-muted">
            Raison sociale, SIRET et adresse à faire figurer sur les factures.
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Raison sociale" className="sm:col-span-2">
          <div className="relative">
            <input
              value={values.companyName}
              onChange={(event) => {
                const text = event.target.value;
                update({ companyName: text });
                if (!foreign) setLookup(text);
              }}
              onKeyDown={suggest.onKeyDown}
              role="combobox"
              aria-expanded={Boolean(suggest.list)}
              aria-controls={suggest.listId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className={fieldControlClass}
              placeholder="Nom de la société ou SIRET"
            />
            {!foreign && lookup !== null && !/^\d+$/.test(lookup.replace(/\s/g, "")) ? suggest.list : null}
          </div>
        </Field>
        {foreign ? (
          <Field label="Identifiant d’entreprise" hint="Numéro de registre, hors SIRET.">
            <input
              value={values.registrationNumber}
              onChange={(event) => update({ registrationNumber: event.target.value })}
              autoComplete="off"
              className={fieldControlClass}
              placeholder="NUI, numéro d’entreprise"
            />
          </Field>
        ) : (
          <Field label="SIRET" error={siretHint} hint={!siretHint ? "14 chiffres" : undefined}>
            <div className="relative">
              <input
                value={values.siret}
                onChange={(event) => onSiret(event.target.value)}
                onKeyDown={suggest.onKeyDown}
                inputMode="numeric"
                autoComplete="off"
                className={fieldControlClass}
                placeholder="000 000 000 00000"
              />
              {lookup !== null && /^\d+$/.test(lookup.replace(/\s/g, "")) ? suggest.list : null}
            </div>
          </Field>
        )}
        <Field label={foreign ? "N° fiscal" : "N° TVA intracommunautaire"}>
          <input
            value={values.vatNumber}
            onChange={(event) => update({ vatNumber: event.target.value.toUpperCase() })}
            autoComplete="off"
            className={fieldControlClass}
            placeholder={foreign ? "Numéro fiscal" : "FRXX000000000"}
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
      <AddressFields
        lineLabel="Adresse de facturation"
        country={address.country}
        onCountryChange={(country) => editAddress({ country })}
        line={address.line}
        postal={address.postal}
        city={address.city}
        onLineChange={(line) => editAddress({ line })}
        onPostalChange={(postal) => editAddress({ postal })}
        onCityChange={(city) => editAddress({ city })}
        onCommit={(next) => {
          const edited = billingAddressEdit(values, address, next);
          onChange(edited.values, { sameAsProfile: edited.sameAsProfile });
        }}
      />
      <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
        <input
          type="checkbox"
          checked={sameAsProfile}
          onChange={(event) => {
            if (event.target.checked) {
              update(
                {
                  billingCountry: profileAddress.country || "FR",
                  billingLine: profileAddress.line,
                  billingPostal: profileAddress.postal,
                  billingCity: profileAddress.city,
                },
                { sameAsProfile: true }
              );
              return;
            }
            const kept = billingAddressEdit(values, address, {});
            onChange(kept.values, { sameAsProfile: false });
          }}
        />
        Adresse de facturation identique à l’adresse du voyageur
      </label>
    </section>
  );
}
