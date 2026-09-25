"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPE_LABELS, type CrmCompanion, type CrmTravelDocument, type TravelDocType } from "@/lib/crm/types";
import { countryName } from "@/lib/crm/countries";
import { nationalityFromIdentity } from "@/lib/crm/document-identity";
import { documentExpiryStatus, documentExpiryWarning, identityOverwriteWarning } from "@/lib/crm/identity";
import { formatDateFr } from "@/lib/crm/money";
import { appendPassportImportForm, listedIdentities } from "@/lib/crm/passport-extract";
import { documentHolderName } from "@/lib/crm/document-identity";
import { isVaultDocument } from "@/lib/crm/trip-documents";
import { StatusChip } from "@/components/crm/ui";
import {
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  SexSelect,
} from "@/components/crm/fields";
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";
import { BusyBar } from "@/components/crm/BusyBar";
import { fileKindIcon } from "@/components/crm/FileOpen";
import { PieceLink } from "@/components/account/PieceSheet";
import { Icon } from "@/components/crm/icons";

export function DocumentsManager({
  documents,
  companions,
  holder,
}: {
  documents: CrmTravelDocument[];
  companions: CrmCompanion[];
  holder: { first_name: string | null; last_name: string | null };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [otherDoc, setOtherDoc] = useState(false);
  const [docType, setDocType] = useState<TravelDocType>("passport");
  const [companionId, setCompanionId] = useState("");
  const [number, setNumber] = useState("");
  const [issuingCountry, setIssuingCountry] = useState("");
  const [docIssued, setDocIssued] = useState("");
  const [docExpiry, setDocExpiry] = useState("");
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [authority, setAuthority] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [usageName, setUsageName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [nationality, setNationality] = useState("");
  const [sex, setSex] = useState("");
  const [applyIdentity, setApplyIdentity] = useState(true);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [nameWarn, setNameWarn] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function applyScan(result: ScanResult) {
    setScan(result);
    setOtherDoc(false);
    const id = result.identity;
    if (!id) return;
    setDocType(id.doc_type);
    if (id.number) setNumber(id.number);
    if (id.issuing_country) setIssuingCountry(id.issuing_country);
    if (id.issued_on) setDocIssued(id.issued_on);
    if (id.expires_on) setDocExpiry(id.expires_on);
    if (id.place_of_birth) setPlaceOfBirth(id.place_of_birth);
    if (id.authority) setAuthority(id.authority);
    if (id.personal_number) setPersonalNumber(id.personal_number);
    if (id.first_name || id.last_name) {
      setNameWarn(
        identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id)
      );
    }
    if (id.first_name) setFirstName(id.first_name);
    if (id.last_name) setLastName(id.last_name);
    setUsageName(id.usage_name || "");
    if (id.birth_date) setBirthDate(id.birth_date);
    const nationalityIso = nationalityFromIdentity(id);
    if (nationalityIso) setNationality(nationalityIso);
    if (id.sex) setSex(id.sex);
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
              doc_type: docType || identity.doc_type,
              number: number || identity.number,
              issuing_country: issuingCountry || identity.issuing_country,
              issued_on: docIssued || identity.issued_on,
              expires_on: docExpiry || identity.expires_on,
              place_of_birth: placeOfBirth || identity.place_of_birth,
              authority: authority || identity.authority,
              personal_number: personalNumber || identity.personal_number,
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
        companionId: companionId || null,
        applyIdentity,
      });
      const res = await fetch("/api/client/documents", { method: "POST", body: form });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(json.error || "Erreur");
        return;
      }
      setScan(null);
      setNumber("");
      setDocIssued("");
      setDocExpiry("");
      setPlaceOfBirth("");
      setAuthority("");
      setPersonalNumber("");
      setIssuingCountry("");
      setFirstName("");
      setLastName("");
      setUsageName("");
      setBirthDate("");
      setNationality("");
      setSex("");
      router.refresh();
      return;
    }
    const form = new FormData();
    if (scan?.file) form.set("file", scan.file);
    form.set("doc_type", docType);
    form.set("companion_id", companionId);
    form.set("number", number);
    form.set("issuing_country", issuingCountry);
    form.set("issued_on", docIssued);
    form.set("expires_on", docExpiry);
    form.set("place_of_birth", placeOfBirth);
    form.set("authority", authority);
    form.set("personal_number", personalNumber);
    form.set("first_name", firstName);
    form.set("last_name", lastName);
    form.set("usage_name", usageName);
    form.set("birth_date", birthDate);
    form.set("nationality", nationality);
    form.set("sex", sex);
    form.set("apply_identity", applyIdentity ? "1" : "0");
    const extra = event.currentTarget.elements.namedItem("extra_file");
    if (extra instanceof HTMLInputElement && extra.files?.[0] && !scan?.file) {
      form.set("file", extra.files[0]);
    }
    const res = await fetch("/api/client/documents", { method: "POST", body: form });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Erreur");
      return;
    }
    setScan(null);
    setNumber("");
    setDocIssued("");
    setDocExpiry("");
    setPlaceOfBirth("");
    setAuthority("");
    setPersonalNumber("");
    setIssuingCountry("");
    setFirstName("");
    setLastName("");
    setUsageName("");
    setBirthDate("");
    setNationality("");
    setSex("");
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/client/documents?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const vault = documents.filter(isVaultDocument);
  const expiryWarn = documentExpiryWarning(docExpiry);

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {vault.map((d) => {
          const status = documentExpiryStatus(d.expires_on);
          const open = openId === d.id;
          const holderName = documentHolderName(d, holder, companions);
          const line = [DOC_TYPE_LABELS[d.doc_type], d.number, d.expires_on ? `exp. ${formatDateFr(d.expires_on)}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={d.id} className="admin-af-card rounded-2xl px-4 py-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : d.id)}
                  className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
                  aria-expanded={open}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug text-[var(--admin-navy)]">
                      {holderName || "Titulaire à renseigner"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{line}</span>
                  </span>
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                </button>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="shrink-0 text-xs font-semibold text-accent"
                >
                  Retirer
                </button>
              </div>
              {open ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    {[
                      d.issued_on ? `délivré ${formatDateFr(d.issued_on)}` : null,
                      d.place_of_birth,
                      d.issuing_country ? countryName(d.issuing_country) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {d.storage_path ? (
                    <PieceLink
                      path={d.storage_path}
                      title={d.file_name || "Pièce"}
                      className="inline-flex items-center gap-1 rounded-full bg-[#efebe0] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--admin-navy)]"
                    >
                      <Icon name={fileKindIcon(d.mime_type, d.file_name)} className="h-4 w-4" />
                      Ouvrir
                    </PieceLink>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {!vault.length ? (
          <li className="rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-8 text-center text-sm text-muted">
            Aucun document dans le coffre-fort.
          </li>
        ) : null}
      </ul>

      <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-3xl p-5">
        <IdentityScan
          title="Scanner un passeport"
          description="Photo ou PDF : un ou plusieurs passeports sur le même fichier. Chaque personne est importée."
          onResult={applyScan}
        />
        {scan ? (
          <div className="flex items-start gap-3">
            {scan.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scan.preview} alt="" className="h-20 w-14 rounded-lg object-cover" />
            ) : scan.file ? (
              <p className="text-xs font-medium text-[var(--admin-navy)]">{scan.file.name}</p>
            ) : null}
            <div className="min-w-0 flex-1 space-y-2">
              <ScanStatus identity={scan.identity} identities={scan.identities} warning={scan.warning} />
              {expiryWarn ? <p className="text-sm text-accent">{expiryWarn}</p> : null}
              {nameWarn ? (
                <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
                  {nameWarn}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
          onClick={() => setOtherDoc((value) => !value)}
        >
          {otherDoc ? "Masquer l’ajout sans photo" : "Autre pièce"}
        </button>

        {scan || otherDoc ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pour qui">
                <select
                  value={companionId}
                  onChange={(event) => setCompanionId(event.target.value)}
                  className={fieldControlClass}
                >
                  <option value="">Moi (titulaire)</option>
                  {companions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  value={docType}
                  onChange={(event) => setDocType(event.target.value as TravelDocType)}
                  className={fieldControlClass}
                >
                  {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="N° de document">
                <input value={number} onChange={(event) => setNumber(event.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Délivré le">
                <DateFrInput value={docIssued} onChange={setDocIssued} />
              </Field>
              <Field label="Expire le">
                <DateFrInput value={docExpiry} onChange={setDocExpiry} />
              </Field>
              <Field label="Pays d’émission">
                <CountrySelect name="issuing_country" value={issuingCountry} onChange={setIssuingCountry} />
              </Field>
              <Field label="Lieu de naissance">
                <input value={placeOfBirth} onChange={(event) => setPlaceOfBirth(event.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Autorité">
                <input value={authority} onChange={(event) => setAuthority(event.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="N° personnel" className="sm:col-span-2">
                <input value={personalNumber} onChange={(event) => setPersonalNumber(event.target.value)} className={fieldControlClass} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
              <input
                type="checkbox"
                checked={applyIdentity}
                onChange={(event) => setApplyIdentity(event.target.checked)}
              />
              Reporter nom, naissance et nationalité sur le profil concerné
            </label>

            {applyIdentity ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={fieldControlClass} />
                </Field>
                <Field label="Nom">
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={fieldControlClass} />
                </Field>
                <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé" className="sm:col-span-2">
                  <input value={usageName} onChange={(event) => setUsageName(event.target.value)} className={fieldControlClass} />
                </Field>
                <Field label="Naissance">
                  <DateFrInput value={birthDate} onChange={setBirthDate} />
                </Field>
                <Field label="Sexe">
                  <SexSelect name="sex" value={sex} onChange={setSex} />
                </Field>
                <Field label="Nationalité" className="sm:col-span-2">
                  <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
                </Field>
              </div>
            ) : null}

            {otherDoc ? (
              <input
                name="extra_file"
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="block text-sm"
              />
            ) : null}

            {error ? <p className="text-sm text-accent">{error}</p> : null}
            <BusyBar active={saving} label="Enregistrement…" />
            <button className="admin-af-btn h-11 w-full rounded-full px-4 text-sm" disabled={saving}>
              {saving ? "Enregistrement…" : "Ajouter un document"}
            </button>
          </>
        ) : null}
      </form>
    </div>
  );
}
