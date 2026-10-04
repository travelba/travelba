"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CrmCompanion, CrmTravelDocument } from "@/lib/crm/types";
import { deleteJson, postJson, sendForm } from "@/lib/crm/client-fetch";
import { nationalityFromIdentity } from "@/lib/crm/document-identity";
import { identityOverwriteWarning, RELATIONSHIP_OPTIONS } from "@/lib/crm/identity";
import { appendPassportForm, appendPassportImportForm, listedIdentities } from "@/lib/crm/passport-extract";
import { documentsForPerson, primaryIdentityDoc } from "@/lib/crm/trip-documents";
import {
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  PhoneField,
  RelationshipSelect,
  SexSelect,
} from "@/components/crm/fields";
import { type ScanResult } from "@/components/crm/IdentityScan";
import { PersonPassportCard } from "@/components/crm/PersonPassportCard";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";

function CompanionPhoneEditor({ companion }: { companion: CrmCompanion }) {
  const router = useRouter();
  const [phone, setPhone] = useState(companion.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await postJson(
        "/api/client/companions",
        {
          id: companion.id,
          first_name: companion.first_name,
          last_name: companion.last_name,
          usage_name: companion.usage_name,
          birth_date: companion.birth_date,
          sex: companion.sex,
          nationality: companion.nationality,
          relationship: companion.relationship,
          phone,
        },
        { method: "PATCH" }
      );
      if (!result.ok) {
        setError(result.error || "Téléphone invalide. Vérifiez l’indicatif et le numéro.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <PhoneField name={`phone-${companion.id}`} label="Téléphone" value={phone} onChange={setPhone} />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <BusyBar active={saving} label="Enregistrement…" />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
      >
        Enregistrer le téléphone
      </button>
    </div>
  );
}

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
  const [usageName, setUsageName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [nationality, setNationality] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [phone, setPhone] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nameWarn, setNameWarn] = useState<string | null>(null);

  function closeForm() {
    setOpen(false);
    setFirstName("");
    setLastName("");
    setUsageName("");
    setRelationship("");
    setNationality("");
    setBirthDate("");
    setSex("");
    setPhone("");
    setScan(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await submit();
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
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
              sex: (sex as typeof identity.sex) || identity.sex,
            }
          : identity
      );
      const form = appendPassportImportForm(new FormData(), {
        identities: patched,
        file: scan.file,
        createUnmatchedOnly: true,
      });
      const docs = await sendForm("/api/client/documents", form);
      if (!docs.ok) {
        setError(docs.error || "Impossible d’importer ces passeports. Réessayez ou écrivez à l’agence.");
        return;
      }
      closeForm();
      router.refresh();
      return;
    }
    const created = await postJson<{ companion?: { id: string } }>("/api/client/companions", {
      first_name: firstName,
      last_name: lastName,
      usage_name: usageName,
      relationship,
      nationality,
      birth_date: birthDate,
      sex,
      phone,
    });
    if (!created.ok || !created.data?.companion?.id) {
      setError(created.error || "Impossible d’ajouter ce voyageur. Réessayez ou écrivez à l’agence.");
      return;
    }
    if (scan?.file) {
      const form = new FormData();
      form.set("file", scan.file);
      form.set("companion_id", created.data.companion.id);
      appendPassportForm(form, scan.identity, true);
      const upload = await sendForm("/api/client/documents", form);
      if (!upload.ok) {
        // Le voyageur existe : on le dit, et la pièce se rajoute depuis sa fiche.
        router.refresh();
        setError(
          `${firstName || "Le voyageur"} est ajouté, mais sa pièce n’a pas pu être enregistrée (${
            upload.error || "erreur"
          }). Rouvrez sa fiche pour la joindre.`
        );
        return;
      }
    }
    closeForm();
    router.refresh();
  }

  async function remove(id: string) {
    const result = await deleteJson(`/api/client/companions?id=${id}`);
    if (!result.ok) {
      return { ok: false, error: result.error || "Impossible de retirer ce voyageur. Réessayez ou écrivez à l’agence." };
    }
    router.refresh();
    return { ok: true };
  }

  return (
    <div id="accompagnateurs" className="mt-6 space-y-4">
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
          const pieces = documentsForPerson(documents, c.id).length;
          return (
            <li key={c.id} className="admin-af-card rounded-2xl px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
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
                <ConfirmAction
                  label="Retirer"
                  question={`Retirer ${c.first_name || "ce voyageur"} et ses pièces ?`}
                  hint={
                    pieces
                      ? `${pieces} pièce${pieces > 1 ? "s" : ""} d’identité ser${pieces > 1 ? "ont" : "a"} supprimée${pieces > 1 ? "s" : ""} avec la fiche.`
                      : null
                  }
                  confirmLabel="Retirer"
                  busyLabel="Suppression…"
                  className="inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold text-accent"
                  onConfirm={() => remove(c.id)}
                />
              </div>
              {expanded ? (
                <div className="mt-3 space-y-3">
                  <PersonPassportCard variant="client" companionId={c.id} documents={documents} person={c} />
                  <CompanionPhoneEditor companion={c} />
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
          person={{ first_name: firstName, last_name: lastName }}
          onIdentity={(id) => {
            setNameWarn(
              identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id)
            );
            if (id.first_name) setFirstName(id.first_name);
            if (id.last_name) setLastName(id.last_name);
            setUsageName(id.usage_name || "");
            if (id.birth_date) setBirthDate(id.birth_date);
            const nationalityIso = nationalityFromIdentity(id);
            if (nationalityIso) setNationality(nationalityIso);
            if (id.sex) setSex(id.sex);
          }}
          onScan={setScan}
          onImported={() => {
            closeForm();
            router.refresh();
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
            <input
              required={listedIdentities(scan?.identity, scan?.identities).length < 2}
              autoComplete="off"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={fieldControlClass}
            />
          </Field>
          <Field label="Nom" hint="Nom de naissance, comme sur la pièce">
            <input
              required={listedIdentities(scan?.identity, scan?.identities).length < 2}
              autoComplete="off"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={fieldControlClass}
            />
          </Field>
          <Field label="Nom d'usage" hint="S'il est imprimé sur la pièce" className="sm:col-span-2">
            <input
              autoComplete="off"
              value={usageName}
              onChange={(event) => setUsageName(event.target.value)}
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
          <div className="sm:col-span-2">
            <PhoneField name="phone" label="Téléphone" value={phone} onChange={setPhone} />
            <p className="mt-1 text-xs text-muted">Pour lui envoyer la page du voyage par WhatsApp.</p>
          </div>
        </div>
        {nameWarn ? (
          <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            {nameWarn}
          </p>
        ) : null}
        {error ? <p className="text-sm text-accent">{error}</p> : null}
          <BusyBar active={saving} label="Enregistrement…" />
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
