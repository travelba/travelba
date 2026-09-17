"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion, CrmCustomer } from "@/lib/crm/types";
import { resolveCountryCode } from "@/lib/crm/countries";
import {
  AddressFields,
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  PhoneField,
  SexSelect,
} from "@/components/crm/fields";
import { IdentityScan, type ScanResult } from "@/components/crm/IdentityScan";

export function CustomerEditor({
  customer,
  companions,
}: {
  customer: CrmCustomer;
  companions: CrmCompanion[];
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

  function applyCustomerScan(result: ScanResult) {
    const id = result.identity;
    if (!id) return;
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    if (id.birth_date) setBirthDate(id.birth_date);
    if (id.sex) setSex(id.sex);
    if (id.nationality) setNationality(id.nationality);
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

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="admin-af-card space-y-4 rounded-3xl p-5">
        <IdentityScan
          endpoint="/api/admin/travel-documents/scan"
          title="Remplir l’identité depuis le passeport"
          description="La lecture sert au nom et à la naissance. La pièce elle-même se joint sur le dossier voyage."
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
    </div>
  );
}
