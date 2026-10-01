"use client";

import { useRef, useState } from "react";
import { BrandMark } from "@/components/crm/BrandMark";
import { BusyBar } from "@/components/crm/BusyBar";
import { Field, PhoneField, fieldControlClass } from "@/components/crm/fields";
import {
  CYRIL_OUTBOUND_LABEL,
  CYRIL_RETURN_LABEL,
  cyrilAirportLabel,
  cyrilFlightClock,
  cyrilFlightTitle,
  cyrilFlights,
  type CyrilFlight,
  type CyrilLeg,
} from "@/lib/crm/cyril-flights";

function FlightChoice({
  flight,
  selected,
  onSelect,
}: {
  flight: CyrilFlight;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(flight.id)}
      className={`flex w-full items-start gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition ${
        selected
          ? "border-[var(--admin-gold)] ring-2 ring-[var(--admin-gold)]"
          : "border-[#e5e3dc] hover:border-[var(--admin-navy)]/30"
      }`}
    >
      <BrandMark
        item={{
          kind: "flight",
          details: {
            airline: flight.airline,
            airline_iata: flight.iata,
            flight_number: flight.number,
          },
        }}
        className="h-10 w-10"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
          {flight.airline} · {flight.number} · {cyrilFlightClock(flight.depart)} →{" "}
          {cyrilFlightClock(flight.arrive)}
        </span>
        <span className="mt-0.5 block text-sm font-semibold leading-snug text-[var(--admin-navy)]">
          {cyrilFlightTitle(flight.leg)}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{cyrilAirportLabel(flight)}</span>
      </span>
    </button>
  );
}

function FlightGroup({
  leg,
  label,
  value,
  onChange,
}: {
  leg: CyrilLeg;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const title = leg === "outbound" ? "Aller" : "Retour";
  return (
    <section className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-gold)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--admin-gold)]" />
          {title}
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-[var(--admin-navy)]">{label}</h2>
        <p className="text-sm text-muted">{cyrilFlightTitle(leg)}</p>
      </div>
      <div role="radiogroup" aria-label={`Vol ${title.toLowerCase()}`} className="space-y-2">
        {cyrilFlights(leg).map((flight) => (
          <FlightChoice
            key={flight.id}
            flight={flight}
            selected={value === flight.id}
            onSelect={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function FrozenFlight({
  flight,
  eyebrow,
  label,
  onEdit,
}: {
  flight: CyrilFlight;
  eyebrow: string;
  label: string;
  onEdit: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-gold)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--admin-gold)]" />
            {eyebrow}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-[var(--admin-navy)]">{label}</h2>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-sm font-semibold text-[var(--admin-navy)] underline decoration-[var(--admin-gold)] underline-offset-4"
        >
          Modifier
        </button>
      </div>
      <div className="pointer-events-none">
        <FlightChoice flight={flight} selected onSelect={() => undefined} />
      </div>
    </section>
  );
}

export function CyrilFlightForm() {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [companion, setCompanion] = useState("");
  const [outboundId, setOutboundId] = useState("");
  const [returnId, setReturnId] = useState("");
  const [step, setStep] = useState<"outbound" | "return" | "confirm">("outbound");
  const [honeypot, setHoneypot] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const outbound = cyrilFlights("outbound").find((flight) => flight.id === outboundId) || null;
  const inbound = cyrilFlights("return").find((flight) => flight.id === returnId) || null;

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showError(message: string) {
    setError(message);
    queueMicrotask(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function chooseOutbound(id: string) {
    if (!lastName.trim() || !firstName.trim()) {
      showError("Indiquez votre nom et votre prénom.");
      return;
    }
    if (!phone) {
      showError("Indiquez un numéro de téléphone valide.");
      return;
    }
    setError(null);
    setOutboundId(id);
    setStep("return");
    scrollTop();
  }

  function chooseReturn(id: string) {
    setError(null);
    setReturnId(id);
    setStep("confirm");
    scrollTop();
  }

  function backToOutbound() {
    setError(null);
    setStep("outbound");
    scrollTop();
  }

  function backToReturn() {
    setError(null);
    setStep("return");
    scrollTop();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!outboundId || !returnId) {
      setError("Choisissez le vol aller et le vol retour.");
      return;
    }
    if (!phone) {
      setError("Indiquez un numéro de téléphone valide.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/anniversaire-cyril", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lastName,
          firstName,
          phone,
          companion,
          outboundId,
          returnId,
          tb_hp: honeypot,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "Envoi impossible");
        return;
      }
      setDone(true);
    } catch {
      setError("Envoi impossible");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="aura-card px-5 py-8 text-center">
        <p className="font-display text-2xl font-semibold text-[var(--admin-navy)]">C’est noté</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          L’agence organise le transfert avec ces vols. Pour corriger un horaire, renvoyez le
          formulaire.
        </p>
        <button
          type="button"
          className="admin-af-btn mt-6 rounded-full px-5 py-2.5 text-sm"
          onClick={() => setDone(false)}
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
          Anniversaire de Cyril
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Marrakech, du 8 au 11 octobre 2026. Indiquez qui voyage et les vols pris, pour organiser
          le transfert.
        </p>
      </div>

      {step === "outbound" ? (
        <>
          <section className="space-y-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-gold)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--admin-gold)]" />
              Vous
            </p>
            <Field label="Nom">
              <input
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className={fieldControlClass}
              />
            </Field>
            <Field label="Prénom">
              <input
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className={fieldControlClass}
              />
            </Field>
            <PhoneField name="phone" value={phone} onChange={setPhone} required />
            <Field label="Accompagnateur" hint="Prénom et nom, s’il voyage avec vous. Facultatif.">
              <input
                autoComplete="off"
                value={companion}
                onChange={(event) => setCompanion(event.target.value)}
                className={fieldControlClass}
              />
            </Field>
          </section>
          {error ? (
            <p ref={errorRef} className="text-sm font-medium text-[var(--admin-red)]">
              {error}
            </p>
          ) : null}
          <FlightGroup
            leg="outbound"
            label={CYRIL_OUTBOUND_LABEL}
            value={outboundId}
            onChange={chooseOutbound}
          />
        </>
      ) : null}

      {step !== "outbound" && outbound ? (
        <FrozenFlight
          flight={outbound}
          eyebrow="Aller retenu"
          label={CYRIL_OUTBOUND_LABEL}
          onEdit={backToOutbound}
        />
      ) : null}

      {step === "return" ? (
        <FlightGroup
          leg="return"
          label={CYRIL_RETURN_LABEL}
          value={returnId}
          onChange={chooseReturn}
        />
      ) : null}

      {step === "confirm" && inbound ? (
        <FrozenFlight
          flight={inbound}
          eyebrow="Retour retenu"
          label={CYRIL_RETURN_LABEL}
          onEdit={backToReturn}
        />
      ) : null}

      <div className="absolute -left-[9999px] h-0 overflow-hidden" aria-hidden="true">
        <label>
          Site web
          <input
            tabIndex={-1}
            autoComplete="off"
            name="tb_hp"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </label>
      </div>

      {step === "confirm" && error ? (
        <p ref={errorRef} className="text-sm font-medium text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
      {step === "confirm" ? (
        <>
          {pending ? <BusyBar label="Envoi" /> : null}
          <button
            type="submit"
            disabled={pending || !returnId}
            className="admin-af-btn w-full rounded-full px-5 py-2.5 text-sm disabled:opacity-60"
          >
            Envoyer
          </button>
        </>
      ) : null}
    </form>
  );
}
