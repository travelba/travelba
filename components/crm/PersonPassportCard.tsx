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
  PASSPORT_VAULT_NOTICE,
  documentExpiryStatus,
  documentExpiryWarning,
  maskDocumentNumber,
  type ExtractedIdentity,
} from "@/lib/crm/identity";
import { formatDateFr } from "@/lib/crm/money";
import { appendPassportImportForm, listedIdentities } from "@/lib/crm/passport-extract";
import { identityForPerson } from "@/lib/crm/passport-assign";
import { documentNameNotice } from "@/lib/crm/document-identity";
import { passportConfirmCopy, scanAwaitsConfirmation, scanWouldPersist } from "@/lib/crm/passport-confirm";
import { sendForm } from "@/lib/crm/client-fetch";
import type { PersonName } from "@/lib/crm/person-match";
import { vaultDocumentsForPerson } from "@/lib/crm/trip-documents";
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { FilePreviewTile } from "@/components/crm/FilePreview";
import { PassportSeal } from "@/components/crm/PassportSeal";
import { identityPreview } from "@/lib/crm/preview-files";
import { StatusChip } from "@/components/crm/ui";

type PassportSource = {
  doc_type?: TravelDocType | string | null;
  number?: string | null;
  issuing_country?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  usage_name?: string | null;
  birth_date?: string | null;
  place_of_birth?: string | null;
  nationality?: string | null;
  sex?: string | null;
  authority?: string | null;
  personal_number?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
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
    ["Nom d'usage", source.usage_name],
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
    ["Domicile", domicileLine(source)],
  ] as const;
}

function domicileLine(source: PassportSource) {
  const city = [source.postal_code, source.city].filter(Boolean).join(" ");
  const line = [source.address_line, city].filter(Boolean).join(", ");
  return line || null;
}

export function passportCompactLabel(source: PassportSource, options?: { maskNumber?: boolean }) {
  const type =
    source.doc_type && source.doc_type in DOC_TYPE_LABELS
      ? DOC_TYPE_LABELS[source.doc_type as TravelDocType]
      : source.doc_type || "Passeport";
  const expiry = source.expires_on ? `exp. ${formatDateFr(source.expires_on)}` : null;
  const number = options?.maskNumber ? maskDocumentNumber(source.number) : source.number;
  const parts = [type, number, expiry].filter(Boolean);
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
  onCancel,
  onBusyChange,
  onImported,
}: {
  variant: "admin" | "client";
  customerId?: string;
  companionId?: string | null;
  documents: CrmTravelDocument[];
  persist?: boolean;
  person?: PersonName | null;
  onIdentity?: (identity: ExtractedIdentity) => void;
  /** Reçu seulement à « Enregistrer » / « Confirmer » (ou tout de suite quand rien ne s’enregistre). */
  onScan?: (result: ScanResult) => void;
  /** Client : « Annuler » sur la pièce lue, le parent oublie le scan. */
  onCancel?: () => void;
  /** L’enregistrement est en cours : le parent peut bloquer son propre bouton. */
  onBusyChange?: (busy: boolean) => void;
  onImported?: (info: { createdCompanions: number }) => void;
}) {
  const router = useRouter();
  const vault = vaultDocumentsForPerson(documents, companionId);
  const [scan, setScan] = useState<ScanResult | null>(null);
  /** La pièce lue attend la relecture avant d’être enregistrée et appliquée au profil. */
  const [pending, setPending] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(vault.length === 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const endpoint = variant === "admin" ? "/api/admin/travel-documents" : "/api/client/documents";
  const scanEndpoint =
    variant === "admin" ? "/api/admin/travel-documents/scan" : "/api/client/documents/scan";
  const expired = vault.find((doc) => documentExpiryWarning(doc.expires_on));

  function flowInput(result: ScanResult) {
    return {
      variant,
      persist,
      hasFile: Boolean(result.file),
      identityCount: listedIdentities(result.identity, result.identities).length,
      customerId,
    };
  }

  function setBusyShared(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  async function persistScan(result: ScanResult) {
    if (!scanWouldPersist(flowInput(result))) return;
    const identities = listedIdentities(result.identity, result.identities);
    setBusyShared(true);
    setError(null);
    setNotice(null);
    try {
      const form = appendPassportImportForm(new FormData(), {
        identities,
        file: result.file,
        customerId,
        companionId,
        createUnmatchedOnly: identities.length > 1 && !companionId,
      });
      const res = await sendForm<{ created_companions?: number }>(endpoint, form);
      if (!res.ok) {
        setError(res.error || "Enregistrement de la pièce impossible. Réessayez ou écrivez à l’agence.");
        return;
      }
      const created = Number(res.data?.created_companions || 0);
      if (created > 0) {
        setNotice(
          created === 1
            ? "1 accompagnateur a été ajouté."
            : `${created} accompagnateurs ont été ajoutés.`
        );
        document.getElementById("accompagnateurs")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setScan(null);
      setAdding(false);
      if (!persist && identities.length > 1) {
        onImported?.({ createdCompanions: created });
      }
      router.refresh();
    } finally {
      setBusyShared(false);
    }
  }

  function shareIdentity(result: ScanResult) {
    const identities = listedIdentities(result.identity, result.identities);
    if (!(identities.length > 1 && !persist)) {
      const mine = identityForPerson(identities, person);
      if (mine) onIdentity?.(mine);
    }
  }

  function handleResult(result: ScanResult) {
    setScan(result);
    setPending(null);
    if (scanAwaitsConfirmation(flowInput(result))) {
      setPending(result);
      return;
    }
    shareIdentity(result);
    onScan?.(result);
    void persistScan(result);
  }

  function confirmPending() {
    const result = pending;
    if (!result) return;
    setPending(null);
    shareIdentity(result);
    onScan?.(result);
    void persistScan(result);
  }

  function cancelPending() {
    setPending(null);
    setScan(null);
    onCancel?.();
  }

  const pendingIdentities = pending ? listedIdentities(pending.identity, pending.identities) : [];
  const pendingMine = pending ? identityForPerson(pendingIdentities, person) : null;
  const pendingNotice =
    pending && pendingIdentities.length === 1
      ? documentNameNotice(pendingMine || pendingIdentities[0], person, {
          applyIdentity: true,
          isHolder: !companionId,
        })
      : null;
  const confirmCopy = pending
    ? passportConfirmCopy({
        variant,
        identityCount: pendingIdentities.length,
        companion: Boolean(companionId),
        firstName: person?.first_name,
      })
    : null;

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const message = json.error || "Suppression impossible";
        if (variant === "admin") setError(message);
        return { ok: false, error: message };
      }
      router.refresh();
      return { ok: true };
    } catch {
      const message = "Connexion interrompue. Réessayez.";
      if (variant === "admin") setError(message);
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-[var(--admin-gold)]/70 bg-[var(--admin-sky)]/40 p-4">
      <p className="font-display text-sm font-bold text-[var(--admin-navy)]">
        Pièces d’identité
      </p>
      {variant === "client" ? (
        <p className="text-xs leading-relaxed text-muted">{PASSPORT_VAULT_NOTICE}</p>
      ) : null}
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
            {variant === "client" && !open ? (
              <PassportSeal onOpen={() => setOpenId(current.id)}>
                <div className="flex min-h-16 items-center justify-between gap-3 py-2">
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                    {passportCompactLabel(current, { maskNumber: true })}
                  </p>
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                </div>
              </PassportSeal>
            ) : (
            <button
              type="button"
              onClick={() => setOpenId(open ? null : current.id)}
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={open}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                  {passportCompactLabel(current, { maskNumber: variant === "client" })}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
                <ChevronDown
                  className={`h-4 w-4 text-[var(--admin-navy)] transition ${open ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            )}
            {open ? (
              <>
                <PassportDetails source={current} />
                {current.storage_path ? (
                  <FilePreviewTile
                    file={
                      identityPreview(
                        {
                          id: current.id,
                          storage_path: current.storage_path,
                          file_name: current.file_name,
                          mime_type: current.mime_type,
                          doc_type: current.doc_type || "passport",
                        },
                        "Passeport"
                      ) || {
                        id: current.id,
                        path: current.storage_path,
                        fileName: current.file_name || "passeport",
                        mimeType: current.mime_type,
                        label: "Passeport",
                        shareText: "Bonjour, je vous transmets un passeport.",
                      }
                    }
                  />
                ) : null}
                {variant === "client" ? (
                  <ConfirmAction
                    label="Retirer"
                    question="Retirer cette pièce ?"
                    hint="Le fichier est supprimé du coffre. Le profil n’est pas modifié."
                    confirmLabel="Retirer"
                    busyLabel="Suppression…"
                    disabled={busy}
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-accent underline"
                    onConfirm={() => remove(current.id)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(current.id)}
                    className="text-xs font-semibold text-accent underline"
                  >
                    Retirer
                  </button>
                )}
              </>
            ) : null}
          </div>
        );
      })}

      {adding || !vault.length ? (
        <>
          {pending ? null : (
            <IdentityScan
              compact
              endpoint={scanEndpoint}
              title={busy ? "Enregistrement…" : "Photo ou PDF du passeport"}
              onResult={handleResult}
            />
          )}
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
                aria-expanded={pending ? true : scanOpen}
              >
                <span className="truncate">
                  {passportCompactLabel(identity, { maskNumber: variant === "client" })}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition ${pending || scanOpen ? "rotate-180" : ""}`} />
              </button>
              {pending || scanOpen ? (
                <div className="mt-2">
                  <PassportDetails source={identity} />
                </div>
              ) : null}
            </div>
          ))}
          {pending ? (
            <div
              className="space-y-3 rounded-xl border border-[var(--admin-gold)]/50 bg-white/90 p-3"
              role="group"
              aria-label={confirmCopy?.question}
            >
              <p className="text-sm font-semibold text-[var(--admin-navy)]">{confirmCopy?.question}</p>
              {confirmCopy?.hint ? <p className="text-xs text-muted">{confirmCopy.hint}</p> : null}
              {pendingIdentities.length > 1 ? (
                <p className="text-xs text-muted">Chaque personne inconnue du foyer devient un accompagnateur.</p>
              ) : null}
              {pendingNotice ? (
                <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
                  {pendingNotice}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmPending}
                  disabled={busy}
                  className="admin-af-btn inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm"
                >
                  {confirmCopy?.confirm}
                </button>
                <button
                  type="button"
                  onClick={cancelPending}
                  disabled={busy}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : null}
          {vault.length && !pending ? (
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

      <BusyBar active={busy} label="Enregistrement…" />
      {notice ? (
        <p className="rounded-xl bg-[#fbf7ec] px-3 py-2 text-sm text-[var(--admin-navy)]">{notice}</p>
      ) : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
