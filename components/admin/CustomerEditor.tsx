"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CrmBillingCompany, CrmCompanion, CrmCustomer, CrmTravelDocument, CompanyRole } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import { identityNationalityFromSources, nationalityFromIdentity } from "@/lib/crm/document-identity";
import { identityOverwriteWarning, type ExtractedIdentity } from "@/lib/crm/identity";
import { appendPassportForm, appendPassportImportForm, listedIdentities } from "@/lib/crm/passport-extract";
import { formatIbanInput, ibanError, normalizeIban } from "@/lib/crm/billing";
import { loyaltyFromCustomer, type LoyaltyMap } from "@/lib/crm/loyalty";
import { LoyaltyFields } from "@/components/crm/LoyaltyFields";
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
  billingCompaniesPayload,
  billingCompanyDrafts,
  BillingCompaniesTabs,
} from "@/components/crm/BillingCompaniesTabs";
import { CompanyRoleFields } from "@/components/crm/CompanyRoleFields";
import { PersonPassportCard } from "@/components/crm/PersonPassportCard";
import { BusyBar } from "@/components/crm/BusyBar";
import { type ScanResult } from "@/components/crm/IdentityScan";
import { vaultDocumentsForPerson } from "@/lib/crm/trip-documents";

function applyIdentityState(
  id: ExtractedIdentity,
  setters: {
    setFirstName: (v: string) => void;
    setLastName: (v: string) => void;
    setUsageName: (v: string) => void;
    setBirthDate: (v: string) => void;
    setSex: (v: string) => void;
    setNationality: (v: string) => void;
  }
) {
  if (id.first_name) setters.setFirstName(id.first_name);
  if (id.last_name) setters.setLastName(id.last_name);
  setters.setUsageName(id.usage_name || "");
  if (id.birth_date) setters.setBirthDate(id.birth_date);
  if (id.sex) setters.setSex(id.sex);
  const nationalityIso = nationalityFromIdentity(id);
  if (nationalityIso) setters.setNationality(nationalityIso);
}

export function CustomerEditor({
  customer,
  companions,
  documents,
  companyAdmins = [],
  billingCompanies = [],
}: {
  customer: CrmCustomer;
  companions: CrmCompanion[];
  documents: CrmTravelDocument[];
  companyAdmins?: CrmCustomer[];
  billingCompanies?: CrmBillingCompany[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name);
  const [usageName, setUsageName] = useState(customer.usage_name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [phoneSecondary, setPhoneSecondary] = useState(customer.phone_secondary || "");
  const [birthDate, setBirthDate] = useState(customer.birth_date || "");
  const [sex, setSex] = useState(customer.sex || "");
  const [nationality, setNationality] = useState(
    identityNationalityFromSources(customer.nationality, vaultDocumentsForPerson(documents, null))
  );
  const [country, setCountry] = useState(resolveCountryCode(customer.country) || "FR");
  const [addressLine, setAddressLine] = useState(customer.address_line || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [city, setCity] = useState(customer.city || "");
  const [loyalty, setLoyalty] = useState<LoyaltyMap>(() => loyaltyFromCustomer(customer));
  const [iban, setIban] = useState(() => formatIbanInput(customer.iban || ""));
  const [companyRole, setCompanyRole] = useState<CompanyRole | null>(customer.company_role || null);
  const [billingParentId, setBillingParentId] = useState(customer.billing_parent_id || "");
  const [nameWarn, setNameWarn] = useState<string | null>(null);
  const [companyDrafts, setCompanyDrafts] = useState(() =>
    billingCompanyDrafts(billingCompanies, customer, {
      country: resolveCountryCode(customer.country) || "FR",
      line: customer.address_line || "",
      postal: customer.postal_code || "",
      city: customer.city || "",
    })
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [onHold, setOnHold] = useState(Boolean(customer.on_hold));

  const profileAddress = {
    country,
    line: addressLine,
    postal: postalCode,
    city,
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedIban = normalizeIban(iban);
    const err = ibanError(normalizedIban);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        usage_name: usageName,
        phone,
        phone_secondary: phoneSecondary,
        birth_date: birthDate,
        sex,
        nationality,
        address_line: addressLine,
        postal_code: postalCode,
        city,
        country,
        loyalty,
        flying_blue: loyalty.flying_blue,
        iban: normalizedIban,
        company_role: companyRole,
        billing_parent_id: companyRole === "member" ? billingParentId || null : null,
        on_hold: onHold,
        billing_companies: billingCompaniesPayload(companyDrafts, profileAddress),
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
          person={{ first_name: firstName, last_name: lastName }}
          onIdentity={(id) => {
            setNameWarn(identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id));
            applyIdentityState(id, {
              setFirstName,
              setLastName,
              setUsageName,
              setBirthDate,
              setSex,
              setNationality,
            });
          }}
        />
        {nameWarn ? (
          <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            {nameWarn}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
            Identité
          </p>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)] sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={onHold} onChange={(e) => setOnHold(e.target.checked)} />
            <span>
              <span className="font-semibold">Compte en veille</span>
              <span className="mt-0.5 block text-xs text-muted">Badge interne. Aucun changement pour le client.</span>
            </span>
          </label>
          <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Nom" hint="Nom de naissance, comme sur la pièce">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé sur le passeport ou la CNI" className="sm:col-span-2">
            <input value={usageName} onChange={(e) => setUsageName(e.target.value)} className={fieldControlClass} />
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
          <p className="sm:col-span-2 text-sm text-muted">E-mail (identifiant) : {customer.email}</p>
          <PhoneField name="phone" value={phone} onChange={setPhone} />
          <OptionalSecondPhone value={phoneSecondary} onChange={setPhoneSecondary} />
        </div>

        <LoyaltyFields values={loyalty} onChange={setLoyalty} />

        <Field label="IBAN" hint="Compte français, 27 caractères" error={ibanError(normalizeIban(iban))}>
          <input
            value={iban}
            onChange={(e) => setIban(formatIbanInput(e.target.value))}
            autoComplete="off"
            spellCheck={false}
            className={fieldControlClass}
            placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
          />
        </Field>

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

        <CompanyRoleFields
          role={companyRole}
          onRoleChange={(role) => {
            setCompanyRole(role);
            if (role !== "member") setBillingParentId("");
          }}
          billingParentId={billingParentId}
          onBillingParentChange={setBillingParentId}
          companyAdmins={companyAdmins}
          selfId={customer.id}
        />

        <BillingCompaniesTabs
          drafts={companyDrafts}
          onChange={setCompanyDrafts}
          profileAddress={profileAddress}
        />

        {saveError ? <p className="text-sm text-accent">{saveError}</p> : null}
        <div className="sticky bottom-4 z-20 -mx-1 rounded-2xl border border-[#e5e3dc] bg-white/95 p-3 shadow-lg backdrop-blur">
          <BusyBar active={saving} label="Enregistrement…" />
          <button className="admin-af-btn w-full rounded-full px-4 py-2 text-sm" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <section id="accompagnateurs" className="space-y-4">
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
  const [usageName, setUsageName] = useState(companion.usage_name || "");
  const [relationship, setRelationship] = useState(companion.relationship || "");
  const [nationality, setNationality] = useState(
    identityNationalityFromSources(
      companion.nationality,
      vaultDocumentsForPerson(documents, companion.id)
    )
  );
  const [birthDate, setBirthDate] = useState(companion.birth_date || "");
  const [sex, setSex] = useState(companion.sex || "");
  const [saving, setSaving] = useState(false);
  const [nameWarn, setNameWarn] = useState<string | null>(null);

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
        usage_name: usageName,
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
        person={{ first_name: firstName, last_name: lastName }}
        onIdentity={(id) => {
          setNameWarn(identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id));
          applyIdentityState(id, {
            setFirstName,
            setLastName,
            setUsageName,
            setBirthDate,
            setSex,
            setNationality,
          });
        }}
      />
      {nameWarn ? (
        <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
          {nameWarn}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom" hint="Nom de naissance, comme sur la pièce">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé" className="sm:col-span-2">
          <input value={usageName} onChange={(e) => setUsageName(e.target.value)} className={fieldControlClass} />
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
      <BusyBar active={saving} label="Enregistrement…" />
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
  const [usageName, setUsageName] = useState("");
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
    setUsageName("");
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
    const identities = listedIdentities(scan?.identity, scan?.identities);
    if (identities.length > 1 && scan?.file) {
      const patched = identities.map((identity, index) =>
        index === 0
          ? {
              ...identity,
              first_name: firstName || identity.first_name,
              last_name: lastName || identity.last_name,
              usage_name: usageName || identity.usage_name,
              birth_date: birthDate || identity.birth_date,
              nationality: nationality || identity.nationality,
              sex: (sex as ExtractedIdentity["sex"]) || identity.sex,
            }
          : identity
      );
      const form = appendPassportImportForm(new FormData(), {
        identities: patched,
        file: scan.file,
        customerId,
        createUnmatchedOnly: true,
      });
      const docs = await fetch("/api/admin/travel-documents", { method: "POST", body: form });
      const docsJson = await docs.json().catch(() => ({}));
      setSaving(false);
      if (!docs.ok) {
        setError(docsJson.error || "Impossible d’importer les passeports");
        return;
      }
      closeForm();
      router.refresh();
      return;
    }
    const res = await fetch("/api/admin/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        first_name: firstName,
        last_name: lastName,
        usage_name: usageName,
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
        person={{ first_name: firstName, last_name: lastName }}
        onIdentity={(id) =>
          applyIdentityState(id, {
            setFirstName,
            setLastName,
            setUsageName,
            setBirthDate,
            setSex,
            setNationality,
          })
        }
        onScan={setScan}
        onImported={() => {
          closeForm();
          router.refresh();
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
          <input required={listedIdentities(scan?.identity, scan?.identities).length < 2} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom">
          <input required={listedIdentities(scan?.identity, scan?.identities).length < 2} value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé" className="sm:col-span-2">
          <input value={usageName} onChange={(e) => setUsageName(e.target.value)} className={fieldControlClass} />
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
      <BusyBar active={saving} label="Enregistrement…" />
      <button className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={saving}>
        {saving ? "Enregistrement…" : "Ajouter l’accompagnateur"}
      </button>
    </form>
  );
}
