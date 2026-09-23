"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import { identityNationalityFromSources, nationalityFromIdentity } from "@/lib/crm/document-identity";
import { identityOverwriteWarning, type ExtractedIdentity } from "@/lib/crm/identity";
import { loyaltyFromCustomer, type LoyaltyMap } from "@/lib/crm/loyalty";
import { formatDateFr } from "@/lib/crm/money";
import { vaultDocumentsForPerson } from "@/lib/crm/trip-documents";
import {
  AddressFields,
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  OptionalSecondPhone,
  PhoneField,
  SexSelect,
} from "@/components/crm/fields";
import { PersonPassportCard } from "@/components/crm/PersonPassportCard";
import { LoyaltyFields } from "@/components/crm/LoyaltyFields";

function Fold({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#e5e3dc] py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--admin-navy)]">{title}</span>
          {open ? null : <span className="block truncate text-xs text-muted">{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="mt-3 grid gap-4">{children}</div> : null}
    </div>
  );
}

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
  const [nationality, setNationality] = useState(
    identityNationalityFromSources(customer.nationality, vaultDocumentsForPerson(documents, null))
  );
  const [phone, setPhone] = useState(customer.phone || "");
  const [phoneSecondary, setPhoneSecondary] = useState(customer.phone_secondary || "");
  const [country, setCountry] = useState(resolveCountryCode(customer.country) || "FR");
  const [addressLine, setAddressLine] = useState(customer.address_line || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [city, setCity] = useState(customer.city || "");
  const [loyalty, setLoyalty] = useState<LoyaltyMap>(() => loyaltyFromCustomer(customer));
  const [nameWarn, setNameWarn] = useState<string | null>(null);
  const hasPassport = vaultDocumentsForPerson(documents, null).length > 0;
  const [openPhone, setOpenPhone] = useState(!customer.phone);
  const [openIdentity, setOpenIdentity] = useState(!customer.first_name && !hasPassport);
  const [openAddress, setOpenAddress] = useState(false);
  const [openLoyalty, setOpenLoyalty] = useState(false);

  function applyIdentity(id: ExtractedIdentity) {
    const warn = identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id);
    setNameWarn(warn);
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    if (id.birth_date) setBirthDate(id.birth_date);
    if (id.sex) setSex(id.sex);
    const nationalityIso = nationalityFromIdentity(id);
    if (nationalityIso) setNationality(nationalityIso);
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
        loyalty,
        flying_blue: loyalty.flying_blue,
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

  const identitySummary =
    [firstName, lastName].filter(Boolean).join(" ") +
    (birthDate ? ` · ${formatDateFr(birthDate)}` : "");
  const addressSummary = [addressLine, postalCode, city].filter(Boolean).join(", ");
  const loyaltyCount = Object.values(loyalty).filter(Boolean).length;

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-[#e3e2e0]/70 bg-white px-4">
      <div className="py-3">
        <PersonPassportCard
          variant="client"
          documents={documents}
          person={{ first_name: firstName, last_name: lastName }}
          onIdentity={applyIdentity}
        />
      </div>
      {nameWarn ? (
        <p className="mb-3 rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
          {nameWarn}
        </p>
      ) : null}

      <Fold
        title="Téléphone"
        summary={phone || "À renseigner"}
        open={openPhone}
        onToggle={() => setOpenPhone((value) => !value)}
      >
        <PhoneField name="phone" value={phone} onChange={setPhone} required />
        <OptionalSecondPhone value={phoneSecondary} onChange={setPhoneSecondary} />
      </Fold>

      <Fold
        title="Identité"
        summary={identitySummary || "À compléter"}
        open={openIdentity}
        onToggle={() => setOpenIdentity((value) => !value)}
      >
        <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
          <input
            autoComplete="given-name"
            spellCheck={false}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={fieldControlClass}
            required
          />
        </Field>
        <Field label="Nom">
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
        <Field label="Nationalité">
          <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
        </Field>
      </Fold>

      <Fold
        title="Adresse"
        summary={addressSummary || "Ajouter"}
        open={openAddress}
        onToggle={() => setOpenAddress((value) => !value)}
      >
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
      </Fold>

      <Fold
        title="Fidélité"
        summary={loyaltyCount ? `${loyaltyCount} programme${loyaltyCount > 1 ? "s" : ""}` : "Ajouter"}
        open={openLoyalty}
        onToggle={() => setOpenLoyalty((value) => !value)}
      >
        <LoyaltyFields values={loyalty} onChange={setLoyalty} onlyFilled />
      </Fold>

      {error ? <p className="py-2 text-sm text-accent">{error}</p> : null}
      <div className="sticky bottom-20 z-20 -mx-4 border-t border-[#e5e3dc] bg-[rgba(250,249,246,0.95)] px-4 py-3 backdrop-blur md:bottom-4">
        {saved ? <p className="mb-2 text-sm text-[var(--admin-navy)]">Enregistré.</p> : null}
        <button className="admin-af-btn w-full rounded-full px-5 py-2.5 text-sm" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
