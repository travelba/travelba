"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DOC_TYPE_LABELS,
  type CrmTravelDocument,
  type TravelDocType,
} from "@/lib/crm/types";
import { countryName, resolveNationality } from "@/lib/crm/countries";
import {
  SEX_OPTIONS,
  documentExpiryStatus,
  documentExpiryWarning,
  type ExtractedIdentity,
} from "@/lib/crm/identity";
import { formatDateFr } from "@/lib/crm/money";
import { appendPassportImportForm, listedIdentities } from "@/lib/crm/passport-extract";
import { identityForPerson } from "@/lib/crm/passport-assign";
import type { PersonName } from "@/lib/crm/person-match";
import { vaultDocumentsForPerson } from "@/lib/crm/trip-documents";
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { Icon } from "@/components/crm/icons";
import { StatusChip } from "@/components/crm/ui";

type PassportSource = {
  doc_type?: TravelDocType | string | null;
  number?: string | null;
  issuing_country?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  place_of_birth?: string | null;
  nationality?: string | null;
  sex?: string | null;
  authority?: string | null;
  personal_number?: string | null;
};

function sexLabel(value: string | null | undefined) {
  return SEX_OPTIONS.find((option) => option.value === value)?.label || value || null;
}

export function passportDetailRows(source: PassportSource) {
  const type =
    source.doc_type && source.doc_type in DOC_TYPE_LABELS
      ? DOC_TYPE_LABELS[source.doc_type as TravelDocType]
      : source.doc_type || "Passeport";
  return [
    ["Type", type],
    ["N° de document", source.number],
    ["Nom", source.last_name],
    ["Prénom(s)", source.first_name],
    ["Date de naissance", source.birth_date ? formatDateFr(source.birth_date) : null],
    ["Lieu de naissance", source.place_of_birth],
    ["Sexe", sexLabel(source.sex)],
    ["Nationalité", countryName(resolveNationality(source.nationality, source.issuing_country))],
    ["Pays d’émission", countryName(source.issuing_country) || source.issuing_country],
    ["Délivré le", source.issued_on ? formatDateFr(source.issued_on) : null],
    ["Expire le", source.expires_on ? formatDateFr(source.expires_on) : null],
    ["Autorité", source.authority],
    ["N° personnel", source.personal_number],
  ] as const;
}

export function passportCompactLabel(source: PassportSource) {
  const type =
    source.doc_type && source.doc_type in DOC_TYPE_LABELS
      ? DOC_TYPE_LABELS[source.doc_type as TravelDocType]
      : source.doc_type || "Passeport";
  const expiry = source.expires_on ? `exp. ${formatDateFr(source.expires_on)}` : null;
  const parts = [type, source.number, expiry].filter(Boolean);
  return parts.join(" · ") || "Pièce d’identité";
}

export function PassportDetails({ source }: { source: PassportSource }) {
  const rows = passportDetailRows(source).filter(([, value]) => value);
  if (!rows.length) return null;
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</dt>
          <dd className="text-sm font-medium text-[var(--admin-navy)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PersonPassportCard({
  variant,
  customerId,
  companionId = null,
  documents,
  persist = true,
  person,
  onIdentity,
  onScan,
}: {
  variant: "admin" | "client";
  customerId?: string;
  companionId?: string | null;
  documents: CrmTravelDocument[];
  persist?: boolean;
  person?: PersonName | null;
  onIdentity?: (identity: ExtractedIdentity) => void;
  onScan?: (result: ScanResult) => void;
}) {
  const router = useRouter();
  const vault = vaultDocumentsForPerson(documents, companionId);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(vault.length === 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const endpoint = variant === "admin" ? "/api/admin/travel-documents" : "/api/client/documents";
  const scanEndpoint =
    variant === "admin" ? "/api/admin/travel-documents/scan" : "/api/client/documents/scan";
  const expired = vault.find((doc) => documentExpiryWarning(doc.expires_on));

  async function persistScan(result: ScanResult) {
    if (!persist || !result.file) return;
    if (variant === "admin" && !customerId) return;
    const identities = listedIdentities(result.identity, result.identities);
    if (!identities.length) return;
    setBusy(true);
    setError(null);
    const form = appendPassportImportForm(new FormData(), {
      identities,
      file: result.file,
      customerId,
      companionId,
    });
    const res = await fetch(endpoint, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement de la pièce impossible");
      return;
    }
    setScan(null);
    setAdding(false);
    router.refresh();
  }

  function handleResult(result: ScanResult) {
    setScan(result);
    const identities = listedIdentities(result.identity, result.identities);
    const mine = identityForPerson(identities, person);
    if (mine) onIdentity?.(mine);
    onScan?.(result);
    void persistScan(result);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Suppression impossible");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-[var(--admin-gold)]/70 bg-[var(--admin-sky)]/40 p-4">
      <p className="font-display text-sm font-bold text-[var(--admin-navy)]">
        Pièces d’identité
      </p>
      {expired ? (
        <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
          {documentExpiryWarning(expired.expires_on)}
        </p>
      ) : null}

      {vault.map((current) => {
        const status = documentExpiryStatus(current.expires_on);
        const open = openId === current.id;
        return (
          <div key={current.id} className="space-y-2 rounded-xl bg-white/80 p-3">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : current.id)}
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={open}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                  {passportCompactLabel(current)}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
                <ChevronDown
                  className={`h-4 w-4 text-[var(--admin-navy)] transition ${open ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {open ? (
              <>
                <PassportDetails source={current} />
                {current.storage_path ? (
                  <FileOpenLink
                    path={current.storage_path}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
                  >
                    <Icon name={fileKindIcon(current.mime_type, current.file_name)} className="h-4 w-4" />
                    Ouvrir le fichier
                  </FileOpenLink>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(current.id)}
                  className="text-xs font-semibold text-accent underline"
                >
                  Retirer
                </button>
              </>
            ) : null}
          </div>
        );
      })}

      {adding || !vault.length ? (
        <>
          <IdentityScan
            compact
            endpoint={scanEndpoint}
            title={busy ? "Enregistrement…" : "Photo ou PDF du passeport"}
            onResult={handleResult}
          />
          {scan ? (
            <ScanStatus
              identity={scan.identity}
              identities={scan.identities}
              warning={scan.warning}
            />
          ) : null}
          {listedIdentities(scan?.identity, scan?.identities).map((identity, index) => (
            <div key={`${identity.number || identity.last_name || "id"}-${index}`}>
              <button
                type="button"
                onClick={() => setScanOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-[var(--admin-navy)]"
                aria-expanded={scanOpen}
              >
                <span className="truncate">{passportCompactLabel(identity)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition ${scanOpen ? "rotate-180" : ""}`} />
              </button>
              {scanOpen ? (
                <div className="mt-2">
                  <PassportDetails source={identity} />
                </div>
              ) : null}
            </div>
          ))}
          {vault.length ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setScan(null);
              }}
              className="text-xs font-semibold text-[var(--admin-navy)] underline"
            >
              Annuler
            </button>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setAdding(true)}
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
        >
          Ajouter un autre passeport
        </button>
      )}

      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
