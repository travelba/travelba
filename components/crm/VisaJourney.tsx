"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileOpenLink } from "@/components/crm/FileOpen";
import { BusyBar } from "@/components/crm/BusyBar";
import { TripVisaUploads } from "@/components/crm/TripVisaUploads";
import { VISA_EUR } from "@/lib/crm/extras";
import { formatMoney } from "@/lib/crm/money";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";
import {
  agencyLaunchReady,
  astraFillsCountry,
  clientVisaProgress,
  clientVisaStepNote,
  clientVisaTrack,
  paymentHold,
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
  return documents.filter((doc) => doc.doc_type === "visa" && doc.issuing_country === iso && doc.storage_path);
}

async function readError(res: Response) {
  const json = (await res.json().catch(() => null)) as { error?: string; issues?: { message?: string }[] } | null;
  return json?.error || json?.issues?.find((row) => row.message)?.message || "La demande n’a pas pu partir.";
}

function ProgressRing({ value }: { value: number }) {
  const radius = 58;
  const turn = 2 * Math.PI * radius;
  const offset = turn - (Math.max(0, Math.min(100, value)) / 100) * turn;
  return (
    <svg viewBox="0 0 148 148" className="h-44 w-44" aria-hidden>
      <circle cx="74" cy="74" r="70" fill="none" stroke="rgba(197,168,128,0.16)" strokeWidth="1" />
      <circle cx="74" cy="74" r={radius} fill="none" stroke="rgba(250,249,246,0.1)" strokeWidth="6" />
      <circle
        cx="74"
        cy="74"
        r={radius}
        fill="none"
        stroke="#C5A880"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={turn}
        strokeDashoffset={offset}
        transform="rotate(-90 74 74)"
        style={{ transition: "stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)" }}
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
    <ol className="relative mt-9 grid grid-cols-5">
      <span aria-hidden className="absolute top-2 right-[10%] left-[10%] h-px bg-white/15" />
      <span
        aria-hidden
        className="absolute top-2 left-[10%] h-px bg-[#C5A880] transition-[width] duration-700"
        style={{ width: `${fill}%` }}
      />
      {track.map((row) => {
        const current = row.state === "en cours" || (step === "piece" && row.id === "piece");
        return (
          <li key={row.id} className="relative flex flex-col items-center">
            <span className="flex h-4 items-center justify-center">
              <span
                className={
                  current
                    ? "z-10 h-3.5 w-3.5 rounded-full bg-[#C5A880] shadow-[0_0_0_6px_rgba(197,168,128,0.2)]"
                    : row.state === "fait"
                      ? "z-10 h-2 w-2 rounded-full bg-[#C5A880]"
                      : "z-10 h-2 w-2 rounded-full bg-[#0B192C] ring-1 ring-white/40"
                }
              />
            </span>
            <span
              className={`mt-2 w-full px-0.5 text-center text-[9px] leading-tight font-semibold tracking-tight ${
                current ? "text-[#faf9f6]" : row.state === "fait" ? "text-[#C5A880]" : "text-white/35"
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
  bookingId,
  reference,
  trip,
  requests,
  travelers,
  documents,
  visaBooked,
  pliantReady = false,
}: {
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passengers = Math.max(1, trip.passengers || travelers.length || 1);
  const fee = passengers * VISA_EUR;
  const corridors = trip.entries.filter((entry) => isCorridor(entry.iso));
  const others = [...trip.entries.filter((entry) => !isCorridor(entry.iso)), ...trip.unknownCountries];
  const liveIsrael = corridors.some((entry) => {
    if (entry.iso !== "IL") return false;
    const step = requests.find((row) => row.country === "IL")?.step;
    return step === "preparation" || step === "remplissage";
  });

  useEffect(() => {
    if (!liveIsrael) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [liveIsrael, router]);

  function fields(iso: string) {
    return answers[iso] || EMPTY;
  }

  async function launch(entry: FormalityEntry & { iso: VisaCorridor }) {
    const current = fields(entry.iso);
    if (!agencyLaunchReady(entry.iso, current)) return;
    setBusy(entry.iso);
    setError(null);
    if (!visaBooked) {
      const extra = await fetch(`/api/client/bookings/${reference}/extras`, {
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
    const res = await fetch(`/api/client/bookings/${reference}/visa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: entry.iso, answers: current }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-4">
      {corridors.map((entry) => {
        const country = entry.iso as VisaCorridor;
        const request = requests.find((row) => row.country === country);
        const step = (request?.step || (request?.status === "piece" ? "piece" : null)) as ClientVisaStep | null;
        const paid = request?.status === "paye" || request?.status === "piece";
        const paymentHeld = step === "paiement" && !paid && !pliantReady;
        const pieces = piecePaths(documents, country);
        const official = VISA_OFFICIAL[country];
        const current = fields(country);
        const ready = agencyLaunchReady(country, current);
        const percent = step ? clientVisaProgress(step) : 0;
        const headline = step ? clientVisaStepNote(step, { paid, paymentHeld: !pliantReady }) : null;
        return (
          <article
            key={country}
            className="overflow-hidden rounded-[1.75rem] bg-[#0B192C] text-[#faf9f6] shadow-[0_28px_70px_rgba(11,25,44,0.28)]"
          >
            <div className="px-5 pb-6 pt-6 sm:px-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C5A880]">
                {entry.formality || "Formalité"}
              </p>
              <h2 className="font-display mt-2 text-[2rem] font-extrabold leading-none tracking-tight">{entry.name}</h2>
              {step ? (
                <div className="mt-8">
                  <div className="relative mx-auto w-fit">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C5A880]/15 blur-3xl"
                    />
                    <ProgressRing value={percent} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="font-display text-[3.25rem] leading-none font-extrabold tabular-nums">
                        {percent}
                        <span className="ml-0.5 align-top text-xl font-semibold text-[#C5A880]">%</span>
                      </p>
                      <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-[#C5A880] uppercase">environ</p>
                    </div>
                  </div>
                  <p className="font-display mt-7 text-center text-[1.65rem] leading-none font-extrabold tracking-tight">
                    {clientVisaTrack(step).find((row) => row.state === "en cours")?.label || "Pièce"}
                  </p>
                  <p
                    className="mx-auto mt-3 max-w-[22rem] text-center text-sm leading-relaxed text-[#faf9f6]/80"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label={`Avancement de la formalité, environ ${percent} pour cent`}
                  >
                    {paymentHeld ? paymentHold(false) : headline}
                  </p>
                  {step !== "piece" && !paymentHeld ? (
                    <p className="mt-4 text-center text-sm text-[#C5A880]">{VISA_WAIT_COPY}</p>
                  ) : null}
                  <StepRail step={step} />
                  {pieces.length ? (
                    <div className="mt-7 flex flex-wrap justify-center gap-2">
                      {pieces.map((doc) =>
                        doc.storage_path ? (
                          <FileOpenLink
                            key={doc.id}
                            path={doc.storage_path}
                            className="inline-flex h-12 items-center rounded-full bg-[#C5A880] px-5 text-sm font-semibold text-[#0B192C]"
                          >
                            Ouvrir l’autorisation
                          </FileOpenLink>
                        ) : null
                      )}
                    </div>
                  ) : null}
                  {entry.applyUrl ? (
                    <div className="mt-6 text-center">
                      <a
                        href={entry.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-[#C5A880] underline decoration-[#C5A880]/40 underline-offset-4"
                      >
                        Lien officiel
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="max-w-[26rem] text-[15px] leading-relaxed text-[#faf9f6]/85">
                    Deux chemins. Le site de l’État, si vous déposez la demande vous-même. Ou nous la prenons, et vous
                    suivez l’avancement ici.
                    {astraFillsCountry(country) ? " La demande part ensuite, sans que vous restiez devant l’écran." : ""}
                  </p>
                  <div className="rounded-[1.35rem] bg-white/[0.04] p-4 ring-1 ring-[#C5A880]/30">
                    <p className="text-[10px] font-bold tracking-[0.18em] text-[#C5A880] uppercase">Avec l’agence</p>
                    <p className="font-display mt-2 text-[1.85rem] leading-none font-extrabold tracking-tight">
                      {formatMoney(fee, "EUR")}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#faf9f6]/70">
                      {VISA_EUR} € par passager, hors frais officiels. Frais d’État : {official.amount} {official.currency}.
                    </p>
                    {country === "US" ? (
                      <div className="mt-4 grid gap-3">
                        <Field
                          label="Adresse du séjour aux États-Unis"
                          value={current.usAddress}
                          onChange={(value) => setAnswers({ ...answers, US: { ...current, usAddress: value } })}
                        />
                        <Field
                          label="Emploi"
                          value={current.employment}
                          onChange={(value) => setAnswers({ ...answers, US: { ...current, employment: value } })}
                        />
                        <Field
                          label="Pays visités"
                          value={current.countriesVisited}
                          onChange={(value) => setAnswers({ ...answers, US: { ...current, countriesVisited: value } })}
                        />
                        <Field
                          label="Refus de visa antérieur"
                          value={current.priorRefusal}
                          onChange={(value) => setAnswers({ ...answers, US: { ...current, priorRefusal: value } })}
                        />
                      </div>
                    ) : null}
                    {country === "GB" ? (
                      <div className="mt-4">
                        <Field
                          label="Refus de visa antérieur"
                          value={current.priorRefusal}
                          onChange={(value) => setAnswers({ ...answers, GB: { ...current, priorRefusal: value } })}
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy !== null || !ready}
                      onClick={() => void launch(entry as FormalityEntry & { iso: VisaCorridor })}
                      className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#C5A880] px-5 text-sm font-semibold text-[#0B192C] disabled:opacity-50"
                    >
                      {busy === country ? "Demande en cours…" : "L’agence s’en charge"}
                    </button>
                    <BusyBar active={busy === country} label="Demande en cours…" tone="light" />
                  </div>
                  {entry.applyUrl ? (
                    <a
                      href={entry.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-12 items-center justify-center rounded-full text-sm font-semibold text-[#faf9f6] ring-1 ring-white/25"
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
            variant="client"
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
