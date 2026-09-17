"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion } from "@/lib/crm/types";
import { countryName, resolveCountryCode } from "@/lib/crm/countries";
import { RELATIONSHIP_OPTIONS } from "@/lib/crm/identity";
import {
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  RelationshipSelect,
  SexSelect,
} from "@/components/crm/fields";
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";

function relationshipLabel(value: string | null) {
  return RELATIONSHIP_OPTIONS.find((option) => option.value === value)?.label || value || "";
}

export function CompanionsManager({ companions }: { companions: CrmCompanion[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [nationality, setNationality] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [keepDocument, setKeepDocument] = useState(true);

  function applyScan(result: ScanResult) {
    setScan(result);
    const id = result.identity;
    if (!id) return;
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    if (id.birth_date) setBirthDate(id.birth_date);
    if (id.nationality) setNationality(id.nationality);
    if (id.sex) setSex(id.sex);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/client/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        relationship,
        nationality,
        birth_date: birthDate,
        sex,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaving(false);
      setError(json.error || "Erreur");
      return;
    }
    if (keepDocument && scan?.file) {
      const form = new FormData();
      form.set("file", scan.file);
      form.set("companion_id", json.companion.id);
      form.set("doc_type", scan.identity?.doc_type || "passport");
      form.set("number", scan.identity?.number || "");
      form.set("issuing_country", scan.identity?.issuing_country || "");
      form.set("expires_on", scan.identity?.expires_on || "");
      await fetch("/api/client/documents", { method: "POST", body: form });
    }
    setSaving(false);
    setFirstName("");
    setLastName("");
    setRelationship("");
    setNationality("");
    setBirthDate("");
    setSex("");
    setScan(null);
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/client/companions?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-4">
      <ul className="space-y-2">
        {companions.map((c) => (
          <li
            key={c.id}
            className="admin-af-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-xs font-bold text-[#f8f6f0]">
                {[c.first_name?.[0], c.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
              </span>
              <div>
                <p className="font-medium text-[var(--admin-navy)]">
                  {c.first_name} {c.last_name}
                </p>
                <p className="text-xs text-muted">
                  {[relationshipLabel(c.relationship), countryName(resolveCountryCode(c.nationality) || c.nationality)]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => remove(c.id)} className="text-xs font-semibold text-accent">
              Retirer
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-3xl p-5">
        <IdentityScan
          title="Ajouter un compagnon depuis son passeport"
          description="La photo remplit nom, prénom, naissance et nationalité. Il ne reste que le lien avec vous."
          onResult={applyScan}
        />
        {scan ? <ScanStatus identity={scan.identity} warning={scan.warning} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom">
            <input
              required
              autoComplete="off"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={fieldControlClass}
            />
          </Field>
          <Field label="Nom">
            <input
              required
              autoComplete="off"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={fieldControlClass}
            />
          </Field>
          <Field label="Lien">
            <RelationshipSelect name="relationship" value={relationship} onChange={setRelationship} />
          </Field>
          <Field label="Nationalité">
            <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
          </Field>
          <Field label="Date de naissance">
            <DateFrInput
              max={new Date().toISOString().slice(0, 10)}
              value={birthDate}
              onChange={setBirthDate}
            />
          </Field>
          <Field label="Sexe">
            <SexSelect name="sex" value={sex} onChange={setSex} />
          </Field>
        </div>
        {scan?.file ? (
          <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="checkbox"
              checked={keepDocument}
              onChange={(event) => setKeepDocument(event.target.checked)}
            />
            Enregistrer aussi le passeport dans les documents
          </label>
        ) : null}
        {error ? <p className="text-sm text-accent">{error}</p> : null}
        <button className="admin-af-btn rounded-full px-4 py-2.5 text-sm" disabled={saving}>
          {saving ? "Enregistrement…" : "Ajouter le compagnon"}
        </button>
      </form>
    </div>
  );
}
