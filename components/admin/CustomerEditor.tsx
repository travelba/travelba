"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import { countryName, resolveCountryCode } from "@/lib/crm/countries";
import { formatDateFr } from "@/lib/crm/money";
import {
  AddressFields,
  CountrySelect,
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
  const [docExpiry, setDocExpiry] = useState("");
  const [docCompanion, setDocCompanion] = useState("");

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
    fd.set("expires_on", docExpiry);
    fd.set("companion_id", docCompanion);
    if (docScan?.file) fd.set("file", docScan.file);
    const extra = event.currentTarget.elements.namedItem("file");
    if (extra instanceof HTMLInputElement && extra.files?.[0] && !docScan?.file) {
      fd.set("file", extra.files[0]);
    }
    await fetch("/api/admin/travel-documents", { method: "POST", body: fd });
    setDocScan(null);
    setDocNumber("");
    setDocCountry("");
    setDocExpiry("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="admin-af-card space-y-4 rounded-3xl p-5">
        <IdentityScan
          endpoint="/api/admin/travel-documents/scan"
          title="Lire le passeport du client"
          onResult={applyCustomerScan}
        />
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
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={fieldControlClass} />
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
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium text-[var(--admin-navy)]">
                  {DOC_TYPE_LABELS[d.doc_type]} {d.number || ""}
                </p>
                <p className="text-xs text-muted">
                  exp. {formatDateFr(d.expires_on)}
                  {d.issuing_country ? ` · ${countryName(d.issuing_country)}` : ""}
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
          ))}
        </ul>
        <IdentityScan endpoint="/api/admin/travel-documents/scan" onResult={applyDocScan} />
        {docScan ? <ScanStatus identity={docScan.identity} warning={docScan.warning} /> : null}
        <form onSubmit={addDoc} className="grid gap-2 sm:grid-cols-2">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className={fieldControlClass}>
            {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select value={docCompanion} onChange={(e) => setDocCompanion(e.target.value)} className={fieldControlClass}>
            <option value="">Titulaire</option>
            {companions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
          <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="Numéro" className={fieldControlClass} />
          <input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} className={fieldControlClass} />
          <CountrySelect name="issuing_country" value={docCountry} onChange={setDocCountry} />
          <input name="file" type="file" className="text-sm" />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm sm:col-span-2">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
