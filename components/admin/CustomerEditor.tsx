"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import { countryName, resolveCountryCode } from "@/lib/crm/countries";
import { documentExpiryStatus } from "@/lib/crm/identity";
import { formatDateFr } from "@/lib/crm/money";
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
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { StatusChip } from "@/components/crm/ui";

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
  const [whatsapp, setWhatsapp] = useState(customer.whatsapp || "");
  const [birthDate, setBirthDate] = useState(customer.birth_date || "");
  const [sex, setSex] = useState(customer.sex || "");
  const [nationality, setNationality] = useState(resolveCountryCode(customer.nationality) || "");
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [docScan, setDocScan] = useState<ScanResult | null>(null);
  const [docType, setDocType] = useState("passport");
  const [docNumber, setDocNumber] = useState("");
  const [docCountry, setDocCountry] = useState("");
  const [docIssued, setDocIssued] = useState("");
  const [docExpiry, setDocExpiry] = useState("");
  const [docCompanion, setDocCompanion] = useState("");
  const [docFirstName, setDocFirstName] = useState("");
  const [docLastName, setDocLastName] = useState("");
  const [docBirthDate, setDocBirthDate] = useState("");
  const [docNationality, setDocNationality] = useState("");
  const [docSex, setDocSex] = useState("");
  const [applyIdentity, setApplyIdentity] = useState(true);

  const profileAddress = {
    country,
    line: addressLine,
    postal: postalCode,
    city,
  };

  function applyIdentityFields(id: NonNullable<ScanResult["identity"]>) {
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    if (id.birth_date) setBirthDate(id.birth_date);
    if (id.sex) setSex(id.sex);
    if (id.nationality) setNationality(id.nationality);
  }

  async function persistIdentity(id: NonNullable<ScanResult["identity"]>) {
    if (docCompanion) return;
    await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: id.first_name || firstName,
        last_name: id.last_name || lastName,
        birth_date: id.birth_date || birthDate,
        sex: id.sex || sex,
        nationality: id.nationality || nationality,
      }),
    });
  }

  function applyDocScan(result: ScanResult) {
    setDocScan(result);
    const id = result.identity;
    if (!id) return;
    setDocType(id.doc_type);
    if (id.number) setDocNumber(id.number);
    if (id.issuing_country) setDocCountry(id.issuing_country);
    if (id.expires_on) setDocExpiry(id.expires_on);
    if (id.first_name) setDocFirstName(id.first_name);
    if (id.last_name) setDocLastName(id.last_name);
    if (id.birth_date) setDocBirthDate(id.birth_date);
    if (id.nationality) setDocNationality(id.nationality);
    if (id.sex) setDocSex(id.sex);
    if (applyIdentity && !docCompanion) {
      applyIdentityFields(id);
      void persistIdentity(id);
    }
  }

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
        whatsapp,
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

  async function addCompanion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    await fetch("/api/admin/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, customer_id: customer.id }),
    });
    form.reset();
    router.refresh();
  }

  async function addDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();
    fd.set("customer_id", customer.id);
    fd.set("doc_type", docType);
    fd.set("number", docNumber);
    fd.set("issuing_country", docCountry);
    fd.set("issued_on", docIssued);
    fd.set("expires_on", docExpiry);
    fd.set("companion_id", docCompanion);
    fd.set("first_name", docFirstName);
    fd.set("last_name", docLastName);
    fd.set("birth_date", docBirthDate);
    fd.set("nationality", docNationality);
    fd.set("sex", docSex);
    fd.set("apply_identity", applyIdentity ? "1" : "0");
    if (docScan?.file) fd.set("file", docScan.file);
    const extra = event.currentTarget.elements.namedItem("file");
    if (extra instanceof HTMLInputElement && extra.files?.[0] && !docScan?.file) {
      fd.set("file", extra.files[0]);
    }
    await fetch("/api/admin/travel-documents", { method: "POST", body: fd });
    setDocScan(null);
    setDocNumber("");
    setDocCountry("");
    setDocIssued("");
    setDocExpiry("");
    setDocFirstName("");
    setDocLastName("");
    setDocBirthDate("");
    setDocNationality("");
    setDocSex("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="admin-af-card space-y-6 rounded-3xl p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
            Identité voyageur
          </p>
          <Field label="Prénom">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Nom">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldControlClass} />
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

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Compagnons</h2>
        <ul className="mt-2 text-sm">
          {companions.map((c) => (
            <li key={c.id}>
              {c.first_name} {c.last_name}
            </li>
          ))}
        </ul>
        <form onSubmit={addCompanion} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="first_name" required placeholder="Prénom" className={fieldControlClass} />
          <input name="last_name" required placeholder="Nom" className={fieldControlClass} />
          <select name="relationship" defaultValue="" className={fieldControlClass}>
            <option value="">Lien</option>
            <option value="conjoint">Conjoint(e)</option>
            <option value="enfant">Enfant</option>
            <option value="parent">Parent</option>
            <option value="famille">Famille</option>
            <option value="ami">Ami(e)</option>
            <option value="autre">Autre</option>
          </select>
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm sm:col-span-2">Ajouter</button>
        </form>
      </section>

      <section className="admin-af-card space-y-3 rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Documents</h2>
        <ul className="space-y-2 text-sm">
          {documents.map((d) => {
            const status = documentExpiryStatus(d.expires_on);
            const holder = d.first_name || d.last_name
              ? [d.first_name, d.last_name].filter(Boolean).join(" ")
              : null;
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--admin-navy)]">
                      {DOC_TYPE_LABELS[d.doc_type]} {d.number || ""}
                    </p>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  </div>
                  <p className="text-xs text-muted">
                    {holder ? `${holder} · ` : ""}
                    exp. {formatDateFr(d.expires_on)}
                    {d.issuing_country ? ` · ${countryName(d.issuing_country)}` : ""}
                    {d.nationality ? ` · ${countryName(d.nationality)}` : ""}
                    {d.file_name ? ` · ${d.file_name}` : ""}
                  </p>
                </div>
                {d.storage_path ? (
                  <FileOpenLink
                    path={d.storage_path}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--admin-sky)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {fileKindIcon(d.mime_type, d.file_name)}
                    </span>
                    Ouvrir
                  </FileOpenLink>
                ) : (
                  <span className="text-xs text-muted">Pas de fichier</span>
                )}
              </li>
            );
          })}
        </ul>
        <IdentityScan
          title="Lire un passeport"
          description="Nous reportons nom, prénom, naissance, nationalité et n° de document sur la fiche et le document."
          endpoint="/api/admin/travel-documents/scan"
          onResult={applyDocScan}
        />
        {docScan ? <ScanStatus identity={docScan.identity} warning={docScan.warning} /> : null}
        <form onSubmit={addDoc} className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={fieldControlClass}>
              {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pour qui">
            <select value={docCompanion} onChange={(e) => setDocCompanion(e.target.value)} className={fieldControlClass}>
              <option value="">Titulaire</option>
              {companions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="N° de document">
            <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Délivré le">
            <DateFrInput value={docIssued} onChange={setDocIssued} />
          </Field>
          <Field label="Expire le">
            <DateFrInput value={docExpiry} onChange={setDocExpiry} />
          </Field>
          <Field label="Pays d’émission">
            <CountrySelect name="issuing_country" value={docCountry} onChange={setDocCountry} />
          </Field>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="checkbox"
              checked={applyIdentity}
              onChange={(event) => setApplyIdentity(event.target.checked)}
            />
            Reporter l’identité sur le profil concerné
          </label>
          {applyIdentity ? (
            <>
              <Field label="Prénom">
                <input value={docFirstName} onChange={(e) => setDocFirstName(e.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Nom">
                <input value={docLastName} onChange={(e) => setDocLastName(e.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Naissance">
                <DateFrInput value={docBirthDate} onChange={setDocBirthDate} />
              </Field>
              <Field label="Sexe">
                <SexSelect name="doc_sex" value={docSex} onChange={setDocSex} />
              </Field>
              <Field label="Nationalité" className="sm:col-span-2">
                <CountrySelect name="doc_nationality" value={docNationality} onChange={setDocNationality} />
              </Field>
            </>
          ) : null}
          <input name="file" type="file" className="text-sm sm:col-span-2" />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm sm:col-span-2">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
