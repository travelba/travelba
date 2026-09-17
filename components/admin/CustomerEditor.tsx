"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import { countryName, resolveCountryCode } from "@/lib/crm/countries";
import { appendIdentityFields, documentHolderName } from "@/lib/crm/document-identity";
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
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";

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
  const [whatsapp, setWhatsapp] = useState(customer.whatsapp || "");
  const [whatsappSame, setWhatsappSame] = useState(
    !customer.whatsapp || customer.whatsapp === customer.phone
  );
  const [birthDate, setBirthDate] = useState(customer.birth_date || "");
  const [sex, setSex] = useState(customer.sex || "");
  const [nationality, setNationality] = useState(resolveCountryCode(customer.nationality) || "");
  const [country, setCountry] = useState(resolveCountryCode(customer.country) || "FR");
  const [addressLine, setAddressLine] = useState(customer.address_line || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [city, setCity] = useState(customer.city || "");
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

  function applyCustomerScan(result: ScanResult) {
    const id = result.identity;
    if (!id) return;
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    if (id.birth_date) setBirthDate(id.birth_date);
    if (id.sex) setSex(id.sex);
    if (id.nationality) setNationality(id.nationality);
  }

  function applyDocScan(result: ScanResult) {
    setDocScan(result);
    applyCustomerScan(result);
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
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        whatsapp: whatsappSame ? phone : whatsapp,
        birth_date: birthDate,
        sex,
        nationality,
        address_line: addressLine,
        postal_code: postalCode,
        city,
        country,
      }),
    });
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
    appendIdentityFields(
      fd,
      {
        first_name: docFirstName,
        last_name: docLastName,
        birth_date: docBirthDate,
        nationality: docNationality,
        sex: docSex,
      },
      applyIdentity
    );
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
      <form onSubmit={save} className="admin-af-card space-y-4 rounded-3xl p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Nom">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldControlClass} />
          </Field>
          <PhoneField name="phone" value={phone} onChange={setPhone} className="sm:col-span-2" />
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={whatsappSame} onChange={(e) => setWhatsappSame(e.target.checked)} />
            WhatsApp identique
          </label>
          {!whatsappSame ? (
            <PhoneField name="whatsapp" label="WhatsApp" value={whatsapp} onChange={setWhatsapp} className="sm:col-span-2" />
          ) : null}
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
        <button className="admin-af-btn rounded-full px-4 py-2 text-sm">Enregistrer</button>
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
            const holder = documentHolderName(d, customer, companions);
            const meta = [
              holder || null,
              d.birth_date ? `né(e) ${formatDateFr(d.birth_date)}` : null,
              d.nationality ? countryName(d.nationality) : null,
              d.issued_on ? `délivré ${formatDateFr(d.issued_on)}` : null,
              `exp. ${formatDateFr(d.expires_on)}`,
              d.issuing_country ? countryName(d.issuing_country) : null,
              d.file_name,
            ].filter(Boolean);
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--admin-navy)]">
                    {DOC_TYPE_LABELS[d.doc_type]}
                    {d.number ? ` · ${d.number}` : ""}
                  </p>
                  <p className="text-xs text-muted">{meta.join(" · ")}</p>
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
        <IdentityScan endpoint="/api/admin/travel-documents/scan" onResult={applyDocScan} />
        {docScan ? <ScanStatus identity={docScan.identity} warning={docScan.warning} /> : null}
        <form onSubmit={addDoc} className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={fieldControlClass}>
              {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Titulaire">
            <select value={docCompanion} onChange={(e) => setDocCompanion(e.target.value)} className={fieldControlClass}>
              <option value="">Client</option>
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
            <DateFrInput value={docIssued} onChange={setDocIssued} className={fieldControlClass} />
          </Field>
          <Field label="Expire le">
            <DateFrInput value={docExpiry} onChange={setDocExpiry} className={fieldControlClass} />
          </Field>
          <Field label="Pays d’émission">
            <CountrySelect name="issuing_country" value={docCountry} onChange={setDocCountry} />
          </Field>
          <Field label="Prénom">
            <input value={docFirstName} onChange={(e) => setDocFirstName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Nom">
            <input value={docLastName} onChange={(e) => setDocLastName(e.target.value)} className={fieldControlClass} />
          </Field>
          <Field label="Naissance">
            <DateFrInput
              value={docBirthDate}
              onChange={setDocBirthDate}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Sexe">
            <SexSelect name="doc_sex" value={docSex} onChange={setDocSex} />
          </Field>
          <Field label="Nationalité" className="sm:col-span-2">
            <CountrySelect name="doc_nationality" value={docNationality} onChange={setDocNationality} />
          </Field>
          <Field label="Fichier" className="sm:col-span-2">
            <input name="file" type="file" className="block text-sm" />
          </Field>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="checkbox"
              checked={applyIdentity}
              onChange={(e) => setApplyIdentity(e.target.checked)}
            />
            Reporter nom, naissance et nationalité sur le profil concerné
          </label>
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm sm:col-span-2">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
