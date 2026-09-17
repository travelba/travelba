"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import type { ExtractedIdentity } from "@/lib/crm/identity";
import {
  AddressFields,
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  PhoneField,
  SexSelect,
} from "@/components/crm/fields";
import {
  billingJson,
  billingSameAsProfile,
  companyBillingFromCustomer,
  CompanyBillingFields,
  type CompanyBillingValues,
} from "@/components/crm/CompanyBillingFields";
import { PersonPassportCard } from "@/components/crm/PersonPassportCard";

export function ProfileForm({
  customer,
  documents,
}: {
  customer: CrmCustomer;
  documents: CrmTravelDocument[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name);
  const [birthDate, setBirthDate] = useState(customer.birth_date || "");
  const [sex, setSex] = useState(customer.sex || "");
  const [nationality, setNationality] = useState(resolveCountryCode(customer.nationality) || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [phoneSecondary, setPhoneSecondary] = useState(customer.phone_secondary || "");
  const [country, setCountry] = useState(resolveCountryCode(customer.country) || "FR");
  const [addressLine, setAddressLine] = useState(customer.address_line || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [city, setCity] = useState(customer.city || "");
  const [flyingBlue, setFlyingBlue] = useState(customer.flying_blue || "");
  const [billing, setBilling] = useState<CompanyBillingValues>(() =>
    companyBillingFromCustomer(customer)
  );
  const [sameBillingAddress, setSameBillingAddress] = useState(() =>
    billingSameAsProfile(companyBillingFromCustomer(customer), {
      country: resolveCountryCode(customer.country) || "FR",
      line: customer.address_line || "",
      postal: customer.postal_code || "",
      city: customer.city || "",
    })
  );

  function applyIdentity(id: ExtractedIdentity) {
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    if (id.birth_date) setBirthDate(id.birth_date);
    if (id.sex) setSex(id.sex);
    if (id.nationality) setNationality(id.nationality);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/client/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        sex,
        nationality,
        phone,
        phone_secondary: phoneSecondary,
        address_line: addressLine,
        postal_code: postalCode,
        city,
        country,
        flying_blue: flyingBlue,
        ...billingJson(billing, { country, line: addressLine, postal: postalCode, city }, sameBillingAddress),
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

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-6 p-4 sm:p-5">
      <PersonPassportCard
        variant="client"
        documents={documents}
        onIdentity={applyIdentity}
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
          Identité voyageur
        </p>
        <Field label="Prénom" hint="Comme sur le passeport">
          <input
            autoComplete="given-name"
            spellCheck={false}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={fieldControlClass}
            required
          />
        </Field>
        <Field label="Nom" hint="Comme sur le passeport">
          <input
            autoComplete="family-name"
            spellCheck={false}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className={fieldControlClass}
            required
          />
        </Field>
        <Field label="Date de naissance">
          <DateFrInput
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
            value={birthDate}
            onChange={setBirthDate}
          />
        </Field>
        <Field label="Sexe">
          <SexSelect name="sex" value={sex} onChange={setSex} />
        </Field>
        <Field label="Nationalité" className="sm:col-span-2">
          <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
          Coordonnées
        </p>
        <p className="sm:col-span-2 text-sm text-muted">Email : {customer.email}</p>
        <PhoneField name="phone" value={phone} onChange={setPhone} />
        <PhoneField
          name="phone_secondary"
          label="Téléphone 2"
          value={phoneSecondary}
          onChange={setPhoneSecondary}
        />
        <Field label="N° Flying Blue" className="sm:col-span-2" hint="Programme Air France / KLM">
          <input
            value={flyingBlue}
            onChange={(event) => setFlyingBlue(event.target.value.toUpperCase())}
            autoComplete="off"
            className={fieldControlClass}
            placeholder="1234567890"
          />
        </Field>
      </section>

      <section>
        <p className="mb-4 font-display text-base font-bold text-[var(--admin-navy)]">Adresse</p>
        <AddressFields
          country={country}
          onCountryChange={setCountry}
          line={addressLine}
          postal={postalCode}
          city={city}
          onLineChange={setAddressLine}
          onPostalChange={setPostalCode}
          onCityChange={setCity}
        />
      </section>

      <CompanyBillingFields
        values={billing}
        onChange={setBilling}
        sameAsProfile={sameBillingAddress}
        onSameAsProfileChange={setSameBillingAddress}
        profileAddress={{ country, line: addressLine, postal: postalCode, city }}
      />

      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {saved ? <p className="text-sm text-[var(--admin-navy)]">Enregistré.</p> : null}
      <button className="admin-af-btn rounded-full px-5 py-2.5 text-sm" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
