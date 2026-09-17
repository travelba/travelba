"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import { appendIdentityFields } from "@/lib/crm/document-identity";
import { documentExpiryWarning } from "@/lib/crm/identity";
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
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";

export function ProfileForm({ customer }: { customer: CrmCustomer }) {
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
  const [whatsapp, setWhatsapp] = useState(customer.whatsapp || "");
  const [country, setCountry] = useState(resolveCountryCode(customer.country) || "FR");
  const [addressLine, setAddressLine] = useState(customer.address_line || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [city, setCity] = useState(customer.city || "");
  const [flyingBlue, setFlyingBlue] = useState(customer.flying_blue || "");
  const [billing, setBilling] = useState<CompanyBillingValues>(() => companyBillingFromCustomer(customer));
  const [sameBillingAddress, setSameBillingAddress] = useState(() =>
    billingSameAsProfile(companyBillingFromCustomer(customer), {
      country: resolveCountryCode(customer.country) || "FR",
      line: customer.address_line || "",
      postal: customer.postal_code || "",
      city: customer.city || "",
    })
  );
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [keepDocument, setKeepDocument] = useState(true);

  function applyScan(result: ScanResult) {
    setScan(result);
    const id = result.identity;
    if (!id) return;
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
        whatsapp,
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
    if (keepDocument && scan?.file && scan.identity) {
      const form = new FormData();
      form.set("file", scan.file);
      form.set("doc_type", scan.identity.doc_type);
      form.set("number", scan.identity.number || "");
      form.set("issuing_country", scan.identity.issuing_country || "");
      form.set("expires_on", scan.identity.expires_on || "");
      appendIdentityFields(
        form,
        {
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDate,
          nationality,
          sex,
        },
        false
      );
      await fetch("/api/client/documents", { method: "POST", body: form });
    }
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  const expiryWarn = documentExpiryWarning(scan?.identity?.expires_on);

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-6 p-4 sm:p-5">
      <IdentityScan
        title="Remplir depuis le passeport"
        description="Une photo du document suffit : nous reportons les infos essentielles. Vous n’avez plus qu’à vérifier."
        onResult={applyScan}
      />
      {scan ? <ScanStatus identity={scan.identity} warning={scan.warning} /> : null}
      {expiryWarn ? <p className="text-sm text-accent">{expiryWarn}</p> : null}
      {scan?.file ? (
        <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
          <input
            type="checkbox"
            checked={keepDocument}
            onChange={(event) => setKeepDocument(event.target.checked)}
          />
          Enregistrer aussi le document dans mes pièces
        </label>
      ) : null}

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
        <PhoneField
          name="whatsapp"
          label="WhatsApp"
          value={whatsapp}
          onChange={setWhatsapp}
          className="sm:col-span-2"
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
