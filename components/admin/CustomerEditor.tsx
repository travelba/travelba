"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import { type ExtractedIdentity } from "@/lib/crm/identity";
import { appendPassportForm } from "@/lib/crm/passport-extract";
import {
  AddressFields,
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  OptionalSecondPhone,
  PhoneField,
  RelationshipSelect,
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
import { type ScanResult } from "@/components/crm/IdentityScan";

function applyIdentityState(
  id: ExtractedIdentity,
  setters: {
    setFirstName: (v: string) => void;
    setLastName: (v: string) => void;
    setBirthDate: (v: string) => void;
    setSex: (v: string) => void;
    setNationality: (v: string) => void;
  }
) {
  if (id.first_name) setters.setFirstName(id.first_name);
  if (id.last_name) setters.setLastName(id.last_name);
  if (id.birth_date) setters.setBirthDate(id.birth_date);
  if (id.sex) setters.setSex(id.sex);
  if (id.nationality) setters.setNationality(id.nationality);
}

export function CustomerEditor({
  customer,
  companions,
  documents,
}: {
  customer: CrmCustomer;
  companions: CrmCompanion[];
  documents: CrmTravelDocument[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name);
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone || "");
  const [phoneSecondary, setPhoneSecondary] = useState(customer.phone_secondary || "");
  const [birthDate, setBirthDate] = useState(customer.birth_date || "");
  const [sex, setSex] = useState(customer.sex || "");
  const [nationality, setNationality] = useState(resolveCountryCode(customer.nationality) || "");
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const profileAddress = {
    country,
    line: addressLine,
    postal: postalCode,
    city,
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        phone_secondary: phoneSecondary,
        birth_date: birthDate,
        sex,
        nationality,
        address_line: addressLine,
        postal_code: postalCode,
        city,
        country,
        flying_blue: flyingBlue,
        ...billingJson(billing, profileAddress, sameBillingAddress),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSaveError(json.error || "Enregistrement impossible");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="admin-af-card space-y-6 rounded-3xl p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Fiche client
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
            Voyageur principal
          </h2>
          <p className="mt-1 text-sm text-muted">
            Uploadez sa pièce : l’identité se remplit, puis les coordonnées et la facturation société.
          </p>
        </div>

        <PersonPassportCard
          variant="admin"
          customerId={customer.id}
          documents={documents}
          onIdentity={(id) =>
            applyIdentityState(id, {
              setFirstName,
              setLastName,
              setBirthDate,
              setSex,
              setNationality,
            })
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
            Identité
          </p>
          <Field label="Prénom">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Nom">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Naissance">
            <DateFrInput
              value={birthDate}
              onChange={setBirthDate}
              max={new Date().toISOString().slice(0, 10)}
              autoComplete="bday"
            />
          </Field>
          <Field label="Sexe">
            <SexSelect name="sex" value={sex} onChange={setSex} />
          </Field>
          <Field label="Nationalité" className="sm:col-span-2">
            <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
            Coordonnées
          </p>
          <Field label="Email" className="sm:col-span-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldControlClass} />
          </Field>
          <PhoneField name="phone" value={phone} onChange={setPhone} />
          <OptionalSecondPhone value={phoneSecondary} onChange={setPhoneSecondary} />
          <Field label="N° Flying Blue" className="sm:col-span-2" hint="Programme Air France / KLM">
            <input
              value={flyingBlue}
              onChange={(e) => setFlyingBlue(e.target.value.toUpperCase())}
              autoComplete="off"
              className={fieldControlClass}
              placeholder="1234567890"
            />
          </Field>
        </div>

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
          profileAddress={profileAddress}
        />

        {saveError ? <p className="text-sm text-accent">{saveError}</p> : null}
        <button className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Accompagnateurs</h2>
          <p className="mt-1 text-sm text-muted">
            Même principe : une pièce par personne, qui remplit son identité.
          </p>
        </div>
        {companions.map((companion) => (
          <CompanionCard
            key={companion.id}
            customerId={customer.id}
            companion={companion}
            documents={documents}
          />
        ))}
        <AddCompanionForm customerId={customer.id} />
      </section>
    </div>
  );
}

function CompanionCard({
  customerId,
  companion,
  documents,
}: {
  customerId: string;
  companion: CrmCompanion;
  documents: CrmTravelDocument[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(companion.first_name);
  const [lastName, setLastName] = useState(companion.last_name);
  const [relationship, setRelationship] = useState(companion.relationship || "");
  const [nationality, setNationality] = useState(resolveCountryCode(companion.nationality) || "");
  const [birthDate, setBirthDate] = useState(companion.birth_date || "");
  const [sex, setSex] = useState(companion.sex || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/admin/companions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: companion.id,
        customer_id: customerId,
        first_name: firstName,
        last_name: lastName,
        relationship,
        nationality,
        birth_date: birthDate,
        sex,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  async function remove() {
    await fetch(`/api/admin/companions?id=${companion.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <article className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
          {companion.first_name} {companion.last_name}
        </h3>
        <button type="button" onClick={() => void remove()} className="text-xs font-semibold text-accent">
          Retirer
        </button>
      </div>
      <PersonPassportCard
        variant="admin"
        customerId={customerId}
        companionId={companion.id}
        documents={documents}
        onIdentity={(id) =>
          applyIdentityState(id, {
            setFirstName,
            setLastName,
            setBirthDate,
            setSex,
            setNationality,
          })
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Lien">
          <RelationshipSelect name="relationship" value={relationship} onChange={setRelationship} />
        </Field>
        <Field label="Nationalité">
          <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
        </Field>
        <Field label="Naissance">
          <DateFrInput
            value={birthDate}
            onChange={setBirthDate}
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Sexe">
          <SexSelect name="sex" value={sex} onChange={setSex} />
        </Field>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        className="admin-af-btn rounded-full px-4 py-2 text-sm"
        disabled={saving}
      >
        {saving ? "Enregistrement…" : "Enregistrer l’accompagnateur"}
      </button>
    </article>
  );
}

function AddCompanionForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [nationality, setNationality] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function closeForm() {
    setOpen(false);
    setFirstName("");
    setLastName("");
    setRelationship("");
    setNationality("");
    setBirthDate("");
    setSex("");
    setScan(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        first_name: firstName,
        last_name: lastName,
        relationship,
        nationality,
        birth_date: birthDate,
        sex,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      setError(json.error || "Impossible d’ajouter l’accompagnateur");
      return;
    }
    if (scan?.file) {
      const form = new FormData();
      form.set("customer_id", customerId);
      form.set("companion_id", json.companion.id);
      form.set("file", scan.file);
      appendPassportForm(form, scan.identity, true);
      await fetch("/api/admin/travel-documents", { method: "POST", body: form });
    }
    setSaving(false);
    closeForm();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-af-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm"
      >
        <Plus className="h-4 w-4" />
        Ajouter un accompagnateur
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
          Ajouter un accompagnateur
        </h3>
        <button
          type="button"
          onClick={closeForm}
          className="text-xs font-semibold text-muted"
        >
          Annuler
        </button>
      </div>
      <PersonPassportCard
        variant="admin"
        customerId={customerId}
        documents={[]}
        persist={false}
        onIdentity={(id) =>
          applyIdentityState(id, {
            setFirstName,
            setLastName,
            setBirthDate,
            setSex,
            setNationality,
          })
        }
        onScan={setScan}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom">
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom">
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Lien">
          <RelationshipSelect name="relationship" value={relationship} onChange={setRelationship} />
        </Field>
        <Field label="Nationalité">
          <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
        </Field>
        <Field label="Naissance">
          <DateFrInput
            value={birthDate}
            onChange={setBirthDate}
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Sexe">
          <SexSelect name="sex" value={sex} onChange={setSex} />
        </Field>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <button className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={saving}>
        {saving ? "Enregistrement…" : "Ajouter l’accompagnateur"}
      </button>
    </form>
  );
}
