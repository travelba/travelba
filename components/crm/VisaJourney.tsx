"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileOpenLink } from "@/components/crm/FileOpen";
import { BusyBar } from "@/components/crm/BusyBar";
import { TripVisaUploads } from "@/components/crm/TripVisaUploads";
import { travelerDisplayName } from "@/lib/crm/trip-documents";
import type { VisaCorridor } from "@/lib/crm/visa-fees";
import {
  agencyLaunchReady,
  astraFillsCountry,
  canReturnToOffer,
  clientVisaProgress,
  clientVisaStepNote,
  clientVisaTrack,
  journeyStarted,
  paymentHold,
  visaConfirmationCopy,
  VISA_WAIT_COPY,
  type ClientVisaStep,
  type EstaAnswers,
} from "@/lib/crm/visa-flow";
import type { FormalityEntry, FrenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

type VisaRequest = {
  country: string;
  step?: ClientVisaStep | null;
  status?: string | null;
  accepted_at?: string | null;
};

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
  return documents.filter((doc) => doc.doc_type === "visa" && doc.issuing_country === iso && doc.storage_path);
}

async function readError(res: Response) {
  const json = (await res.json().catch(() => null)) as { error?: string; issues?: { message?: string }[] } | null;
  return json?.error || json?.issues?.find((row) => row.message)?.message || "La demande n’a pas pu partir.";
}

function ProgressRing({ value }: { value: number }) {
  const radius = 28;
  const turn = 2 * Math.PI * radius;
  const offset = turn - (Math.max(0, Math.min(100, value)) / 100) * turn;
  return (
    <svg viewBox="0 0 72 72" className="h-16 w-16" aria-hidden>
      <circle cx="36" cy="36" r={radius} fill="none" stroke="rgba(250,249,246,0.14)" strokeWidth="3" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="#C5A880"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={turn}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  );
}

function StepRail({ step }: { step: ClientVisaStep }) {
  const track = clientVisaTrack(step);
  const index = step === "piece" ? track.length - 1 : Math.max(0, track.findIndex((row) => row.state === "en cours"));
  const span = Math.max(1, track.length - 1);
  const fill = (index / span) * 80;
  return (
    <ol className="relative mt-4 grid grid-cols-5">
      <span aria-hidden className="absolute top-1.5 right-[10%] left-[10%] h-px bg-white/15" />
      <span
        aria-hidden
        className="absolute top-1.5 left-[10%] h-px bg-[#C5A880] transition-[width] duration-700"
        style={{ width: `${fill}%` }}
      />
      {track.map((row) => {
        const current = row.state === "en cours" || (step === "piece" && row.id === "piece");
        return (
          <li key={row.id} className="relative flex flex-col items-center">
            <span className="flex h-3 items-center justify-center">
              <span
                className={
                  current
                    ? "z-10 h-2 w-2 rounded-full bg-[#C5A880] ring-2 ring-[#C5A880]/30"
                    : row.state === "fait"
                      ? "z-10 h-1.5 w-1.5 rounded-full bg-[#C5A880]"
                      : "z-10 h-1.5 w-1.5 rounded-full bg-[#0B192C] ring-1 ring-white/35"
                }
              />
            </span>
            <span
              className={`mt-1.5 w-full px-0.5 text-center text-[9px] leading-tight font-medium ${
                current ? "text-[#faf9f6]" : row.state === "fait" ? "text-[#C5A880]" : "text-white/40"
              }`}
            >
              {row.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function VisaJourney({
  variant = "client",
  bookingId,
  reference,
  trip,
  requests,
  travelers,
  documents,
  pliantReady = false,
}: {
  variant?: "admin" | "client";
  bookingId: string;
  reference: string;
  trip: FrenchPassportTrip;
  requests: VisaRequest[];
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  visaBooked: boolean;
  pliantReady?: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, EstaAnswers>>({});
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function patchAnswer(country: string, key: keyof EstaAnswers, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [country]: { ...EMPTY, ...prev[country], [key]: value },
    }));
  }

  const corridors = trip.entries.filter((entry) => isCorridor(entry.iso));
  const others = [...trip.entries.filter((entry) => !isCorridor(entry.iso)), ...trip.unknownCountries];
  const liveIsrael = corridors.some((entry) => {
    if (entry.iso !== "IL") return false;
    const request = requests.find((row) => row.country === "IL");
    if (!journeyStarted(request)) return false;
    return request?.step === "preparation" || request?.step === "remplissage";
  });

  useEffect(() => {
    if (!liveIsrael) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [liveIsrael, router]);

  function fields(iso: string) {
    return answers[iso] || EMPTY;
  }

  function selection(country: string) {
    return picked[country] ?? travelers.map((row) => row.id);
  }

  function toggleTraveler(country: string, id: string) {
    const current = selection(country);
    const next = current.includes(id) ? current.filter((row) => row !== id) : [...current, id];
    setPicked((prev) => ({ ...prev, [country]: next }));
  }

  async function confirm(entry: FormalityEntry & { iso: VisaCorridor }) {
    const country = entry.iso;
    const current = fields(country);
    const ids = selection(country);
    if (!agencyLaunchReady(country, current)) return;
    if (travelers.length && ids.length < 1) return;
    setBusy(country);
    setError(null);
    const visaUrl =
      variant === "admin" ? `/api/admin/bookings/${bookingId}/visa` : `/api/client/bookings/${reference}/visa`;
    const payload =
      variant === "admin"
        ? { action: "run", country, answers: current, confirm: true, travelerIds: ids }
        : { country, answers: current, confirm: true, travelerIds: ids };
    const res = await fetch(visaUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setConfirming(null);
    router.refresh();
  }

  return (
    <section className="space-y-4">
      {corridors.map((entry) => {
        const country = entry.iso as VisaCorridor;
        const request = requests.find((row) => row.country === country);
        const started = journeyStarted(request);
        const step = (
          started && !canReturnToOffer(request)
            ? request?.step || (request?.status === "piece" ? "piece" : "preparation")
            : null
        ) as ClientVisaStep | null;
        const paid = request?.status === "paye" || request?.status === "piece";
        const paymentHeld = step === "paiement" && !paid && !pliantReady;
        const pieces = piecePaths(documents, country);
        const current = fields(country);
        const ready = agencyLaunchReady(country, current);
        const chosen = selection(country);
        const count = travelers.length ? chosen.length : Math.max(1, trip.passengers || 1);
        const open = confirming === country;
        return (
          <article
            key={country}
            className="overflow-hidden rounded-2xl bg-[#0B192C] text-[#faf9f6] shadow-[0_8px_22px_rgba(11,25,44,0.14)]"
          >
            <div className="px-4 py-4">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#C5A880] uppercase">
                {entry.formality || "Formalité"}
              </p>
              <h2 className="font-display mt-1 text-base leading-none font-semibold">{entry.name}</h2>
              {step ? (
                <JourneyBody step={step} paid={paid} paymentHeld={paymentHeld} pieces={pieces} pliantReady={pliantReady} />
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-snug text-[#faf9f6]/85">
                    Le site de l’État, si vous déposez la demande vous-même. Ou nous la prenons.
                    {astraFillsCountry(country) ? " Le formulaire se remplit ensuite, sans que vous restiez devant l’écran." : ""}
                  </p>
                  {country === "US" ? (
                    <div className="grid gap-3">
                      <Field
                        label="Adresse du séjour aux États-Unis"
                        value={current.usAddress}
                        onChange={(value) => patchAnswer("US", "usAddress", value)}
                      />
                      <Field
                        label="Emploi"
                        value={current.employment}
                        onChange={(value) => patchAnswer("US", "employment", value)}
                      />
                      <Field
                        label="Pays visités"
                        value={current.countriesVisited}
                        onChange={(value) => patchAnswer("US", "countriesVisited", value)}
                      />
                      <Field
                        label="Refus de visa antérieur"
                        value={current.priorRefusal}
                        onChange={(value) => patchAnswer("US", "priorRefusal", value)}
                      />
                    </div>
                  ) : null}
                  {country === "GB" ? (
                    <Field
                      label="Refus de visa antérieur"
                      value={current.priorRefusal}
                      onChange={(value) => patchAnswer("GB", "priorRefusal", value)}
                    />
                  ) : null}
                  {open ? (
                    <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-[#C5A880]/25">
                      <p className="text-sm leading-snug text-[#faf9f6]/90">{visaConfirmationCopy({ travelers: count, country })}</p>
                      {travelers.length ? (
                        <ul className="mt-3 space-y-2">
                          {travelers.map((traveler) => (
                            <li key={traveler.id}>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={chosen.includes(traveler.id)}
                                  onChange={() => toggleTraveler(country, traveler.id)}
                                  className="h-4 w-4 accent-[#C5A880]"
                                />
                                {travelerDisplayName(traveler)}
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy !== null || !ready || (travelers.length > 0 && chosen.length < 1)}
                        onClick={() => void confirm(entry as FormalityEntry & { iso: VisaCorridor })}
                        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C] disabled:opacity-50"
                      >
                        {busy === country ? "Demande en cours…" : "Confirmer"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setConfirming(null)}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold text-[#faf9f6]/80"
                      >
                        Pas maintenant
                      </button>
                      <BusyBar active={busy === country} label="Demande en cours…" tone="light" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null || !ready}
                      onClick={() => setConfirming(country)}
                      className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C] disabled:opacity-50"
                    >
                      L’agence s’en charge
                    </button>
                  )}
                  {entry.applyUrl ? (
                    <a
                      href={entry.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 items-center justify-center rounded-full text-sm font-semibold text-[#faf9f6] ring-1 ring-white/25"
                    >
                      Lien officiel
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </article>
        );
      })}

      {others.map((entry) => (
        <div key={entry.iso} className="rounded-[1.35rem] bg-white px-4 py-4 text-sm text-[var(--admin-navy)]">
          <p>
            <span className="font-semibold">{entry.name}</span>
            {entry.formality ? ` — ${entry.formality}` : " — formalité non identifiée"}
          </p>
          {entry.applyUrl ? (
            <a
              href={entry.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-10 items-center rounded-full bg-[var(--surface-2)] px-4 text-sm font-semibold ring-1 ring-[#e5e3dc]"
            >
              Lien officiel
            </a>
          ) : null}
        </div>
      ))}

      {trip.entries.length ? (
        <div className="rounded-[1.35rem] bg-white p-4">
          <TripVisaUploads
            variant={variant}
            bookingId={bookingId}
            reference={reference}
            travelers={travelers}
            documents={documents}
            entries={trip.entries}
          />
        </div>
      ) : null}

      {trip.unknownIatas.map((code) => (
        <p key={code} className="text-sm text-[var(--admin-navy)]">
          Aéroport {code} non reconnu.
        </p>
      ))}

      {!trip.needsFormality && !trip.unknownIatas.length && !trip.unknownCountries.length ? (
        <p className="rounded-[1.35rem] bg-white px-4 py-4 text-sm text-[var(--admin-navy)]">
          Aucune formalité identifiée pour un passeport français sur ces vols.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

function JourneyBody({
  step,
  paid,
  paymentHeld,
  pieces,
  pliantReady,
}: {
  step: ClientVisaStep;
  paid: boolean;
  paymentHeld: boolean;
  pieces: CrmTravelDocument[];
  pliantReady: boolean;
}) {
  const percent = clientVisaProgress(step);
  const headline = clientVisaStepNote(step, { paid, paymentHeld: !pliantReady });
  const held = paymentHeld && !pliantReady;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <ProgressRing value={percent} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-base leading-none font-semibold tabular-nums">
              {percent}
              <span className="text-[10px] font-medium text-[#C5A880]">%</span>
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {clientVisaTrack(step).find((row) => row.state === "en cours")?.label || "Pièce"}
          </p>
          <p
            className="mt-1 text-xs leading-snug text-[#faf9f6]/75"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`Avancement de la formalité, ${percent} pour cent`}
          >
            {held ? paymentHold(false) : headline}
          </p>
        </div>
      </div>
      {step !== "piece" && !held ? <p className="mt-2 text-xs text-[#C5A880]">{VISA_WAIT_COPY}</p> : null}
      <StepRail step={step} />
      {pieces.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {pieces.map((doc) =>
            doc.storage_path ? (
              <FileOpenLink
                key={doc.id}
                path={doc.storage_path}
                className="inline-flex h-9 items-center rounded-full bg-[#C5A880] px-3 text-xs font-semibold text-[#0B192C]"
              >
                Ouvrir l’autorisation
              </FileOpenLink>
            ) : null
          )}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#C5A880]">
      {label}
      <input
        className="rounded-2xl border border-[#C5A880]/35 bg-white/5 px-3 py-3 text-sm font-normal text-[#faf9f6] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
