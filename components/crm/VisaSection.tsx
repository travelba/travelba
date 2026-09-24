"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileOpenLink } from "@/components/crm/FileOpen";
import { BusyBar } from "@/components/crm/BusyBar";
import { TripVisaUploads } from "@/components/crm/TripVisaUploads";
import { VISA_EUR } from "@/lib/crm/extras";
import { formatMoney } from "@/lib/crm/money";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";
import {
  agencyLaunchReady,
  clientVisaStepCopy,
  clientVisaTrack,
  VISA_WAIT_COPY,
  type ClientVisaStep,
  type EstaAnswers,
} from "@/lib/crm/visa-flow";
import type { FormalityEntry, FrenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

type VisaRequest = { country: string; step?: ClientVisaStep | null; status?: string | null };

const EMPTY: EstaAnswers = {
  usAddress: "",
  employment: "",
  countriesVisited: "",
  priorRefusal: "",
};

function isCorridor(iso: string): iso is VisaCorridor {
  return iso === "IL" || iso === "US" || iso === "GB";
}

function piecePaths(documents: CrmTravelDocument[], iso: string) {
  return documents.filter(
    (doc) => doc.doc_type === "visa" && doc.issuing_country === iso && doc.storage_path
  );
}

async function readError(res: Response) {
  const json = (await res.json().catch(() => null)) as {
    error?: string;
    issues?: { message?: string }[];
  } | null;
  return json?.error || json?.issues?.find((row) => row.message)?.message || "La demande n’a pas pu partir.";
}

export function VisaSection({
  variant,
  bookingId,
  reference,
  trip,
  requests,
  travelers,
  documents,
  visaBooked,
}: {
  variant: "admin" | "client";
  bookingId: string;
  reference: string;
  trip: FrenchPassportTrip;
  requests: VisaRequest[];
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  visaBooked: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, EstaAnswers>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passengers = Math.max(1, trip.passengers || travelers.length || 1);
  const fee = passengers * VISA_EUR;
  const corridors = trip.entries.filter((entry) => isCorridor(entry.iso));
  const started = corridors.some((entry) => requests.some((row) => row.country === entry.iso && (row.step || row.status)));
  const others = [
    ...trip.entries.filter((entry) => !isCorridor(entry.iso)),
    ...trip.unknownCountries,
  ];
  if (!trip.hasFlight) return null;

  function fields(iso: string) {
    return answers[iso] || EMPTY;
  }

  async function launch(entry: FormalityEntry & { iso: VisaCorridor }) {
    const current = fields(entry.iso);
    if (!agencyLaunchReady(entry.iso, current)) return;
    setBusy(entry.iso);
    setError(null);
    const extrasUrl =
      variant === "admin"
        ? `/api/admin/bookings/${bookingId}/extras`
        : `/api/client/bookings/${reference}/extras`;
    if (!visaBooked) {
      const extra = await fetch(extrasUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "visa", resume: true }),
      });
      if (!extra.ok) {
        setBusy(null);
        setError(await readError(extra));
        return;
      }
    }
    const visaUrl =
      variant === "admin"
        ? `/api/admin/bookings/${bookingId}/visa`
        : `/api/client/bookings/${reference}/visa`;
    const body =
      variant === "admin"
        ? { action: "run", country: entry.iso, answers: current }
        : { country: entry.iso, answers: current };
    const res = await fetch(visaUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    router.refresh();
  }

  return (
    <section className="aura-card space-y-4 rounded-[1.35rem] bg-white p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Visa</p>
        {trip.needsFormality && !started ? (
          <p className="mt-1 text-sm font-semibold text-[var(--admin-navy)]">
            {formatMoney(fee, "EUR")} · {VISA_EUR} € par passager, hors frais officiels
          </p>
        ) : null}
      </div>

      {corridors.map((entry) => {
        const country = entry.iso as VisaCorridor;
        const request = requests.find((row) => row.country === country);
        const step = (request?.step || (request?.status === "piece" ? "piece" : null)) as ClientVisaStep | null;
        const current = fields(country);
        const ready = agencyLaunchReady(country, current);
        const pieces = piecePaths(documents, country);
        const official = VISA_OFFICIAL[country];
        return (
          <div key={country} className="space-y-3 border-t border-[#e5e3dc] pt-3">
            <p className="text-sm font-semibold text-[var(--admin-navy)]">
              {entry.name}
              {entry.formality ? ` — ${entry.formality}` : ""}
            </p>
            <p className="text-xs text-muted">
              Frais d’État : {official.amount} {official.currency}. L’agence facture {VISA_EUR} € par passager en plus.
            </p>
            {step ? (
              <div className="space-y-3">
                {step === "piece" ? null : (
                  <p className="text-sm font-semibold text-[var(--admin-navy)]">{VISA_WAIT_COPY}</p>
                )}
                <ol className="space-y-2 text-sm">
                  {clientVisaTrack(step).map((row) => {
                    const explain = row.state === "en cours" || (step === "piece" && row.id === "piece");
                    return (
                      <li key={row.id} className={row.state === "à venir" ? "text-muted" : "text-[var(--admin-navy)]"}>
                        <p className={explain ? "font-semibold" : ""}>
                          {row.label}
                          {row.state === "fait" && row.id !== "piece" ? " — fait" : ""}
                        </p>
                        {explain ? <p className="text-sm font-normal">{clientVisaStepCopy(row.id)}</p> : null}
                        {row.id === "piece" && pieces.length
                          ? pieces.map((doc) =>
                              doc.storage_path ? (
                                <FileOpenLink
                                  key={doc.id}
                                  path={doc.storage_path}
                                  className="font-semibold text-[var(--aura-blue)]"
                                >
                                  Ouvrir
                                </FileOpenLink>
                              ) : null
                            )
                          : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                {country === "US" ? (
                  <div className="grid gap-2">
                    <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
                      Adresse du séjour aux États-Unis
                      <input
                        className="rounded-xl border px-3 py-2 text-sm font-normal"
                        value={current.usAddress}
                        onChange={(event) =>
                          setAnswers({ ...answers, US: { ...current, usAddress: event.target.value } })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
                      Emploi
                      <input
                        className="rounded-xl border px-3 py-2 text-sm font-normal"
                        value={current.employment}
                        onChange={(event) =>
                          setAnswers({ ...answers, US: { ...current, employment: event.target.value } })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
                      Pays visités
                      <input
                        className="rounded-xl border px-3 py-2 text-sm font-normal"
                        value={current.countriesVisited}
                        onChange={(event) =>
                          setAnswers({ ...answers, US: { ...current, countriesVisited: event.target.value } })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
                      Refus de visa antérieur
                      <input
                        className="rounded-xl border px-3 py-2 text-sm font-normal"
                        value={current.priorRefusal}
                        onChange={(event) =>
                          setAnswers({ ...answers, US: { ...current, priorRefusal: event.target.value } })
                        }
                      />
                    </label>
                  </div>
                ) : null}
                {country === "GB" ? (
                  <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
                    Refus de visa antérieur
                    <input
                      className="rounded-xl border px-3 py-2 text-sm font-normal"
                      value={current.priorRefusal}
                      onChange={(event) =>
                        setAnswers({ ...answers, GB: { ...current, priorRefusal: event.target.value } })
                      }
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null || !ready}
                    onClick={() => void launch(entry as FormalityEntry & { iso: VisaCorridor })}
                    className="inline-flex h-10 items-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === country ? "Demande en cours…" : "L’agence s’en charge"}
                  </button>
                  {entry.applyUrl ? (
                    <a
                      href={entry.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center rounded-full bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
                    >
                      Lien officiel
                    </a>
                  ) : null}
                </div>
                <BusyBar active={busy === country} label="Demande en cours…" />
              </div>
            )}
          </div>
        );
      })}

      {others.map((entry) => (
        <div key={entry.iso} className="space-y-2 border-t border-[#e5e3dc] pt-3 text-sm text-[var(--admin-navy)]">
          <p>
            <span className="font-semibold">{entry.name}</span>
            {entry.formality ? ` — ${entry.formality}` : " — formalité non identifiée"}
          </p>
          {entry.applyUrl ? (
            <a
              href={entry.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-full bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
            >
              Lien officiel
            </a>
          ) : null}
        </div>
      ))}

      {others.length ? (
        <TripVisaUploads
          variant={variant}
          bookingId={bookingId}
          reference={reference}
          travelers={travelers}
          documents={documents}
          entries={others}
        />
      ) : null}

      {trip.unknownIatas.map((code) => (
        <p key={code} className="text-sm text-[var(--admin-navy)]">
          Aéroport {code} non reconnu.
        </p>
      ))}

      {!trip.needsFormality && !trip.unknownIatas.length && !trip.unknownCountries.length ? (
        <p className="text-sm text-[var(--admin-navy)]">
          Aucune formalité identifiée pour un passeport français sur ces vols.
        </p>
      ) : null}

      {started && trip.needsFormality ? (
        <p className="border-t border-[#e5e3dc] pt-3 text-sm text-[var(--admin-navy)]">
          {formatMoney(fee, "EUR")} · {VISA_EUR} € par passager, hors frais officiels
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
