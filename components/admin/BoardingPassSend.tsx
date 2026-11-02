"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import { greetingGivenName } from "@/lib/crm/identity";
import {
  boardingPassChannelBlock,
  boardingPassFields,
  boardingPassFileName,
  boardingPassPreview,
  boardingPassTemplateForCount,
  CHECKIN_SITUATIONS,
  checkinAirportPreview,
  isBoardingPassFile,
  suggestBoardingPass,
  type CheckinSituation,
} from "@/lib/crm/boarding-pass-whatsapp";
import type { CrmBookingDocument, CrmBookingItem, CrmBookingTraveler } from "@/lib/crm/types";

type Draft = {
  documentId: string;
  label: string;
  firstName: string;
  lastName: string;
  flight: string;
  route: string;
  when: string;
  seat: string;
};

function draftsFrom(documents: CrmBookingDocument[], items: CrmBookingItem[], travelers: CrmBookingTraveler[]): Draft[] {
  return documents.filter(isBoardingPassFile).map((doc) => {
    const suggested = suggestBoardingPass({ doc, items, travelers });
    return { documentId: doc.id, label: doc.file_name || "PDF", ...suggested };
  });
}

export function BoardingPassSend({
  bookingId,
  clientName,
  phone,
  optInAt,
  optOutAt,
  documents,
  items,
  travelers,
  open,
  onClose,
}: {
  bookingId: string;
  clientName: string;
  phone: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
  documents: CrmBookingDocument[];
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"cartes" | "aeroport">("cartes");
  const [rows, setRows] = useState<Draft[]>(() => draftsFrom(documents, items, travelers));
  const [notice, setNotice] = useState({
    firstName: greetingGivenName(travelers[0]?.first_name) || greetingGivenName(clientName) || "",
    flight: "",
    route: "",
    when: "",
    situation: "echec" as CheckinSituation,
  });
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const block = boardingPassChannelBlock({ phone, optInAt, optOutAt });
  const otherPdfs = documents.filter(
    (doc) => !isBoardingPassFile(doc) && ((doc.mime_type || "").includes("pdf") || (doc.file_name || "").toLowerCase().endsWith(".pdf"))
  );

  const readyCards = useMemo(
    () =>
      rows
        .map((row) => ({ ...row, fields: boardingPassFields(row), filename: boardingPassFileName(row) }))
        .filter((row) => row.fields && row.filename),
    [rows]
  );
  const template = boardingPassTemplateForCount(readyCards.length);
  const noticePreview = checkinAirportPreview(notice);

  if (!open) return null;

  function patchRow(documentId: string, key: keyof Draft, value: string) {
    setRows((current) => current.map((row) => (row.documentId === documentId ? { ...row, [key]: value } : row)));
  }

  async function mark(documentId: string) {
    setMarking(true);
    setMarkError(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}/documents`, {
      method: "PATCH",
      body: { id: documentId, kind: "carte d'embarquement" },
    });
    setMarking(false);
    if (!result.ok) {
      setMarkError(result.error || "Le type n’a pas été enregistré.");
      return;
    }
    router.refresh();
    onClose();
  }

  const countLabel = readyCards.length > 1 ? `${readyCards.length} cartes` : "cette carte";

  return (
    <section id="cartes-embarquement" className="admin-af-card scroll-mt-28 space-y-4 rounded-3xl border border-[var(--admin-gold)]/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Cartes d’embarquement</h2>
          <p className="mt-1 text-sm text-muted">
            Le message part sur le WhatsApp de {clientName || "le client"}. Rien ne part sans confirmation.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--admin-navy)]">
          Fermer
        </button>
      </div>
      {block ? <p className="text-sm font-semibold text-[var(--admin-red)]">{block}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("cartes")}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${mode === "cartes" ? "bg-[var(--admin-navy)] text-white" : "border border-[var(--border)] text-[var(--admin-navy)]"}`}
        >
          Envoyer les cartes
        </button>
        <button
          type="button"
          onClick={() => setMode("aeroport")}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${mode === "aeroport" ? "bg-[var(--admin-navy)] text-white" : "border border-[var(--border)] text-[var(--admin-navy)]"}`}
        >
          Enregistrement à terminer
        </button>
      </div>

      {mode === "cartes" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {readyCards.length > 1
              ? "WhatsApp joint un seul PDF par message. Chaque carte part à part, avec le nom du voyageur."
              : "Le PDF est joint au message, pas seulement un lien."}
          </p>
          {rows.length ? (
            rows.map((row) => {
              const fields = boardingPassFields(row);
              const filename = fields ? boardingPassFileName(fields) : null;
              const preview = fields && template ? boardingPassPreview(template, fields) : null;
              return (
                <fieldset key={row.documentId} className="space-y-2 rounded-2xl bg-[var(--admin-sky)] p-3">
                  <legend className="px-1 text-sm font-semibold text-[var(--admin-navy)]">{row.label}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["firstName", "Prénom"],
                        ["lastName", "Nom"],
                        ["flight", "Vol"],
                        ["route", "Trajet"],
                        ["when", "Date et heure"],
                        ["seat", "Siège"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-muted">
                        {label}
                        <input
                          value={row[key]}
                          onChange={(event) => patchRow(row.documentId, key, event.target.value)}
                          className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
                        />
                      </label>
                    ))}
                  </div>
                  {filename ? <p className="text-xs text-muted">Fichier joint : {filename}</p> : null}
                  {preview ? <p className="whitespace-pre-wrap text-sm text-[var(--admin-navy)]">{preview}</p> : (
                    <p className="text-xs text-[var(--admin-red)]">Complétez le prénom, le nom, le vol, le trajet, l’horaire et le siège.</p>
                  )}
                </fieldset>
              );
            })
          ) : (
            <p className="text-sm text-muted">Aucune carte d’embarquement sur ce dossier.</p>
          )}
          {otherPdfs.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--admin-navy)]">Autres PDF du dossier</p>
              <ul className="space-y-1">
                {otherPdfs.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{doc.file_name || "PDF"}</span>
                    <button
                      type="button"
                      disabled={marking}
                      onClick={() => void mark(doc.id)}
                      className="font-semibold text-[var(--admin-navy)] underline disabled:opacity-50"
                    >
                      C’est une carte d’embarquement
                    </button>
                  </li>
                ))}
              </ul>
              {markError ? <p className="text-sm text-[var(--admin-red)]">{markError}</p> : null}
            </div>
          ) : null}
          <ConfirmAction
            label="Envoyer les cartes"
            confirmLabel="Confirmer l’envoi"
            question={`Envoyer ${countLabel} à ${clientName || "le client"} sur WhatsApp ? Le PDF est joint.`}
            hint="Rien ne part sans cette confirmation."
            disabled={Boolean(block) || !template || readyCards.length !== rows.length || rows.length === 0}
            onConfirm={async () => {
              const result = await adminAction<{ sent?: number }>(`/api/admin/bookings/${bookingId}/cartes-embarquement`, {
                method: "POST",
                body: {
                  confirm: true,
                  mode: "cartes",
                  cards: rows.map((row) => ({
                    documentId: row.documentId,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    flight: row.flight,
                    route: row.route,
                    when: row.when,
                    seat: row.seat,
                  })),
                },
              });
              if (!result.ok) return result.error || "L’envoi n’a pas abouti.";
              router.refresh();
              onClose();
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Aucun PDF n’est joint. Le client est invité à terminer l’enregistrement à l’aéroport.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["firstName", "Prénom"],
                ["flight", "Vol"],
                ["route", "Trajet"],
                ["when", "Date et heure"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {label}
                <input
                  value={notice[key]}
                  onChange={(event) => setNotice((current) => ({ ...current, [key]: event.target.value }))}
                  className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
                />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Situation
            <select
              value={notice.situation}
              onChange={(event) => setNotice((current) => ({ ...current, situation: event.target.value as CheckinSituation }))}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
            >
              <option value="echec">{CHECKIN_SITUATIONS.echec}</option>
              <option value="comptoir">{CHECKIN_SITUATIONS.comptoir}</option>
            </select>
          </label>
          {noticePreview ? <p className="whitespace-pre-wrap text-sm text-[var(--admin-navy)]">{noticePreview}</p> : null}
          <ConfirmAction
            label="Envoyer le message"
            confirmLabel="Confirmer l’envoi"
            question={`Envoyer ce message à ${clientName || "le client"} sur WhatsApp ? Aucune carte n’est jointe.`}
            hint="Rien ne part sans cette confirmation."
            disabled={Boolean(block) || !noticePreview}
            onConfirm={async () => {
              const result = await adminAction(`/api/admin/bookings/${bookingId}/cartes-embarquement`, {
                method: "POST",
                body: { confirm: true, mode: "aeroport", notice },
              });
              if (!result.ok) return result.error || "L’envoi n’a pas abouti.";
              router.refresh();
              onClose();
            }}
          />
        </div>
      )}
    </section>
  );
}
