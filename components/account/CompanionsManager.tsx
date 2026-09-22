"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CrmCompanion, CrmTravelDocument } from "@/lib/crm/types";
import { identityOverwriteWarning, RELATIONSHIP_OPTIONS } from "@/lib/crm/identity";
import { appendPassportForm } from "@/lib/crm/passport-extract";
import { documentsForPerson, primaryIdentityDoc } from "@/lib/crm/trip-documents";
import {
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  RelationshipSelect,
  SexSelect,
} from "@/components/crm/fields";
import { type ScanResult } from "@/components/crm/IdentityScan";
import { PersonPassportCard } from "@/components/crm/PersonPassportCard";

function relationshipLabel(value: string | null) {
  return RELATIONSHIP_OPTIONS.find((option) => option.value === value)?.label || value || "";
}

export function CompanionsManager({
  companions,
  documents,
}: {
  companions: CrmCompanion[];
  documents: CrmTravelDocument[];
}) {
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
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nameWarn, setNameWarn] = useState<string | null>(null);

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
    if (scan?.file) {
      const form = new FormData();
      form.set("file", scan.file);
      form.set("companion_id", json.companion.id);
      appendPassportForm(form, scan.identity, true);
      await fetch("/api/client/documents", { method: "POST", body: form });
    }
    setSaving(false);
    closeForm();
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/client/companions?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-4">
      {companions.length === 0 && !open ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-4 text-center text-sm text-muted">
          Aucun voyageur.
        </p>
      ) : null}
      <ul className="space-y-2">
        {companions.map((c) => {
          const doc = primaryIdentityDoc(documentsForPerson(documents, c.id));
          const expanded = expandedId === c.id;
          const piece = doc?.number ? `n° ${doc.number}` : "Pièce à joindre";
          return (
            <li key={c.id} className="admin-af-card rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={expanded}
                >
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[relationshipLabel(c.relationship), piece].filter(Boolean).join(" · ")}
                  </p>
                </button>
                <button type="button" onClick={() => remove(c.id)} className="shrink-0 text-xs font-semibold text-accent">
                  Retirer
                </button>
              </div>
              {expanded ? (
                <div className="mt-3">
                  <PersonPassportCard variant="client" companionId={c.id} documents={documents} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {open ? (
        <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-3xl p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-base font-bold text-[var(--admin-navy)]">
              Ajouter un accompagnateur
            </p>
            <button type="button" onClick={closeForm} className="text-xs font-semibold text-muted">
              Annuler
            </button>
          </div>
        <PersonPassportCard
          variant="client"
          documents={[]}
          persist={false}
          onIdentity={(id) => {
            setNameWarn(
              identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id)
            );
            if (id.first_name) setFirstName(id.first_name);
            if (id.last_name) setLastName(id.last_name);
            if (id.birth_date) setBirthDate(id.birth_date);
            if (id.nationality) setNationality(id.nationality);
            if (id.sex) setSex(id.sex);
          }}
          onScan={setScan}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
            <input
              required
              autoComplete="off"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={fieldControlClass}
            />
          </Field>
          <Field label="Nom" hint="Comme sur le passeport">
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
        {nameWarn ? (
          <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            {nameWarn}
          </p>
        ) : null}
        {error ? <p className="text-sm text-accent">{error}</p> : null}
          <button className="admin-af-btn rounded-full px-4 py-2.5 text-sm" disabled={saving}>
            {saving ? "Enregistrement…" : "Ajouter l’accompagnateur"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="admin-af-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm"
        >
          <Plus className="h-4 w-4" />
          Ajouter un accompagnateur
        </button>
      )}
    </div>
  );
}
