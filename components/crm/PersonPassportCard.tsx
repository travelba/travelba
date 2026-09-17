"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DOC_TYPE_LABELS,
  type CrmTravelDocument,
  type TravelDocType,
} from "@/lib/crm/types";
import { countryName } from "@/lib/crm/countries";
import { SEX_OPTIONS, documentExpiryStatus, type ExtractedIdentity } from "@/lib/crm/identity";
import { formatDateFr } from "@/lib/crm/money";
import { appendPassportForm } from "@/lib/crm/passport-extract";
import { documentsForPerson, primaryIdentityDoc } from "@/lib/crm/trip-documents";
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
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
    ["Nationalité", countryName(source.nationality) || source.nationality],
    ["Pays d’émission", countryName(source.issuing_country) || source.issuing_country],
    ["Délivré le", source.issued_on ? formatDateFr(source.issued_on) : null],
    ["Expire le", source.expires_on ? formatDateFr(source.expires_on) : null],
    ["Autorité", source.authority],
    ["N° personnel", source.personal_number],
  ] as const;
}

export function PassportDetails({ source }: { source: PassportSource }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {passportDetailRows(source).map(([label, value]) => (
        <div key={label}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</dt>
          <dd className="text-sm font-medium text-[var(--admin-navy)]">{value || "—"}</dd>
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
  onIdentity,
  onScan,
}: {
  variant: "admin" | "client";
  customerId?: string;
  companionId?: string | null;
  documents: CrmTravelDocument[];
  persist?: boolean;
  onIdentity?: (identity: ExtractedIdentity) => void;
  onScan?: (result: ScanResult) => void;
}) {
  const router = useRouter();
  const current = primaryIdentityDoc(documentsForPerson(documents, companionId));
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const endpoint = variant === "admin" ? "/api/admin/travel-documents" : "/api/client/documents";
  const scanEndpoint =
    variant === "admin" ? "/api/admin/travel-documents/scan" : "/api/client/documents/scan";
  const showScan = !current || replacing;
  const status = current ? documentExpiryStatus(current.expires_on) : null;
  const preview = scan?.identity || current;

  async function persistScan(result: ScanResult) {
    if (!persist || !result.file) return;
    if (variant === "admin" && !customerId) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (customerId) form.set("customer_id", customerId);
    if (companionId) form.set("companion_id", companionId);
    form.set("file", result.file);
    appendPassportForm(form, result.identity, true);
    const res = await fetch(endpoint, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement de la pièce impossible");
      return;
    }
    setScan(null);
    setReplacing(false);
    router.refresh();
  }

  function handleResult(result: ScanResult) {
    setScan(result);
    if (result.identity) onIdentity?.(result.identity);
    onScan?.(result);
    void persistScan(result);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-[var(--admin-gold)]/70 bg-[var(--admin-sky)]/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm font-bold text-[var(--admin-navy)]">
            Pièce d’identité
          </p>
        </div>
        {current && status ? <StatusChip tone={status.tone}>{status.label}</StatusChip> : null}
      </div>

      {showScan ? (
        <>
          <IdentityScan
            compact
            endpoint={scanEndpoint}
            title={busy ? "Enregistrement…" : "Photographier le passeport"}
            onResult={handleResult}
          />
          {scan ? <ScanStatus identity={scan.identity} warning={scan.warning} /> : null}
        </>
      ) : null}

      {preview ? <PassportDetails source={preview} /> : null}

      {current?.storage_path ? (
        <FileOpenLink
          path={current.storage_path}
          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
        >
          <span className="material-symbols-outlined text-[16px]">
            {fileKindIcon(current.mime_type, current.file_name)}
          </span>
          Ouvrir le fichier
        </FileOpenLink>
      ) : null}

      {current ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setReplacing((value) => !value)}
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
        >
          {replacing ? "Annuler" : "Remplacer la pièce"}
        </button>
      ) : null}

      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
