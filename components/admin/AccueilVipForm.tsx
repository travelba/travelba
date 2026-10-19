"use client";

import type { BookingExtract } from "@/lib/crm/ingest-types";
import {
  composeAccueilVip,
  parseAccueilVipService,
  readAccueilVipFields,
  type AccueilVipFlight,
  type AccueilVipRole,
  type AccueilVipService,
} from "@/lib/crm/accueil-vip";
import { itemClock } from "@/lib/crm/carnet";
import { Field, MoneyInput } from "@/components/crm/fields";
import { STAY_CURRENCIES } from "@/lib/crm/stay-currency";
import type { CrmBookingItem } from "@/lib/crm/types";

type StepDraft = Omit<BookingExtract["items"][number], "kind"> & { kind: "accueil_vip" | BookingExtract["items"][number]["kind"] };

const control =
  "w-full rounded-xl border border-border bg-white px-3 text-base text-[var(--admin-navy)] outline-none h-11 focus:border-[var(--admin-navy)]";

function detailText(item: AccueilVipFlight, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function clockLabel(iso: string | null | undefined) {
  const match = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const clock = itemClock(iso);
  if (!clock) return "";
  return `${match[3]}/${match[2]} ${clock}`;
}

function flightChoice(flight: AccueilVipFlight, role: AccueilVipRole) {
  const number = detailText(flight, "flight_number");
  const city = role === "arrival" ? detailText(flight, "city_to") : detailText(flight, "city_from");
  const iata = (role === "arrival" ? detailText(flight, "to") : detailText(flight, "from")).toUpperCase();
  const when = clockLabel(role === "arrival" ? flight.end_at : flight.start_at);
  const place = [city, iata].filter(Boolean).join(" ");
  return [number, place, when].filter(Boolean).join(" · ") || flight.title || "Vol";
}

function countValue(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export function AccueilVipForm({
  item,
  flights,
  currency,
  onChange,
  onRemove,
}: {
  item: StepDraft;
  flights: AccueilVipFlight[];
  currency: string;
  onChange: (next: StepDraft) => void;
  onRemove?: () => void;
}) {
  const fields = readAccueilVipFields({
    supplier: item.supplier,
    confirmation_ref: item.confirmation_ref,
    amount: item.amount,
    details: (item.details || {}) as Record<string, unknown>,
  });
  const service = parseAccueilVipService(fields.service) || "arrival";
  const devise =
    fields.documentCurrency && (STAY_CURRENCIES as readonly string[]).includes(fields.documentCurrency)
      ? fields.documentCurrency
      : currency;
  const price = (devise === currency ? fields.amount : fields.documentAmount) ?? null;

  function publish(next: {
    service?: AccueilVipService;
    provider?: string;
    arrivalFlightId?: string;
    departureFlightId?: string;
    passengers?: number;
    bags?: number;
    hotline?: string;
    email?: string;
    confirmation?: string;
    clientInfo?: string;
    price?: number | null;
    devise?: string;
  }) {
    const chosen = next.service || service;
    const provider = next.provider ?? fields.provider;
    const arrivalFlightId = next.arrivalFlightId ?? fields.arrivalFlightId;
    const departureFlightId = next.departureFlightId ?? fields.departureFlightId;
    const passengers = next.passengers ?? fields.passengers ?? 1;
    const bags = next.bags ?? fields.bags ?? 0;
    const hotline = next.hotline ?? fields.hotline;
    const email = next.email ?? fields.email;
    const confirmation = next.confirmation ?? fields.confirmation;
    const clientInfo = next.clientInfo ?? fields.clientInfo;
    const nextDevise = next.devise ?? devise;
    const nextPrice = (next.price === undefined ? price : next.price) ?? null;
    const details: Record<string, unknown> = {
      vip_service: chosen,
      passenger_count: passengers,
      bag_count: bags,
      client_info: clientInfo,
      legs: [
        ...(chosen !== "departure" && arrivalFlightId
          ? [{ role: "arrival", flight_id: arrivalFlightId, airport_iata: "", airport_city: "", at: "", flight_number: "", timezone: "" }]
          : []),
        ...(chosen !== "arrival" && departureFlightId
          ? [{ role: "departure", flight_id: departureFlightId, airport_iata: "", airport_city: "", at: "", flight_number: "", timezone: "" }]
          : []),
      ],
    };
    if (hotline.trim()) details.phone = hotline.trim();
    if (email.trim()) details.email = email.trim();
    let amount: number | null = nextPrice;
    if (nextDevise !== currency && nextPrice != null) {
      details.document_amount = nextPrice;
      details.document_currency = nextDevise;
      amount = null;
    }
    const composed = composeAccueilVip(
      {
        service: chosen,
        provider,
        arrivalFlightId: chosen === "departure" ? "" : arrivalFlightId,
        departureFlightId: chosen === "arrival" ? "" : departureFlightId,
        passengers,
        bags,
        hotline,
        email,
        confirmation,
        clientInfo,
        amount,
        documentAmount: typeof details.document_amount === "number" ? details.document_amount : null,
        documentCurrency: typeof details.document_currency === "string" ? details.document_currency : null,
      },
      flights
    );
    onChange({
      ...item,
      kind: "accueil_vip",
      title: composed.ok ? composed.card.title : "Accueil VIP",
      supplier: provider,
      confirmation_ref: confirmation,
      start_at: composed.ok ? composed.card.start_at || "" : "",
      end_at: composed.ok ? composed.card.end_at || "" : "",
      amount: composed.ok ? composed.card.amount : amount,
      include_in_ledger: false,
      details: composed.ok ? { ...(item.details || {}), ...composed.card.details } : { ...(item.details || {}), ...details },
    });
  }

  const preview = composeAccueilVip(
    {
      ...fields,
      service,
      arrivalFlightId: service === "departure" ? "" : fields.arrivalFlightId,
      departureFlightId: service === "arrival" ? "" : fields.departureFlightId,
      passengers: fields.passengers ?? 1,
      bags: fields.bags ?? 0,
      amount: devise === currency ? price : null,
      documentAmount: devise === currency ? null : price ?? null,
      documentCurrency: devise === currency ? null : devise,
    },
    flights
  );
  const roles: AccueilVipRole[] = service === "roundtrip" ? ["arrival", "departure"] : [service];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--admin-navy)]">Accueil VIP</p>
        {onRemove ? (
          <button type="button" className="text-sm font-semibold text-muted underline-offset-2 hover:underline" onClick={onRemove}>
            Retirer
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-[#F4F1EA] p-1">
        {(
          [
            ["arrival", "Arrivée"],
            ["departure", "Départ"],
            ["roundtrip", "Aller-retour"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={service === value}
            onClick={() => publish({ service: value })}
            className={`h-11 rounded-full px-2 text-sm font-semibold ${
              service === value ? "bg-[var(--admin-navy)] text-white" : "text-[var(--admin-navy)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="Prestataire">
        <input
          value={fields.provider}
          onChange={(event) => publish({ provider: event.target.value })}
          className={control}
          autoComplete="organization"
          placeholder="Coral Thailand"
        />
      </Field>
      {flights.length ? (
        roles.map((role) => {
          const selected = role === "arrival" ? fields.arrivalFlightId : fields.departureFlightId;
          return (
            <fieldset key={role} className="space-y-2">
              <legend className="text-sm font-medium text-[var(--admin-navy)]">
                {role === "arrival" ? "Vol d’arrivée" : "Vol de départ"}
              </legend>
              <div className="space-y-2">
                {flights.map((flight) => {
                  const id = `vip-${role}-${flight.id}`;
                  return (
                    <label key={id} htmlFor={id} className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-2">
                      <input
                        id={id}
                        type="radio"
                        name={`vip-${role}`}
                        className="mt-1 h-5 w-5 shrink-0"
                        checked={selected === flight.id}
                        onChange={() =>
                          publish(role === "arrival" ? { arrivalFlightId: flight.id } : { departureFlightId: flight.id })
                        }
                      />
                      <span className="text-sm leading-snug text-[var(--admin-navy)]">{flightChoice(flight, role)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })
      ) : (
        <p className="rounded-xl bg-[#F4F1EA] px-3 py-3 text-sm text-[var(--admin-navy)]">
          Ajoutez d’abord un vol au dossier. L’accueil VIP se relie à un vol déjà enregistré.
        </p>
      )}
      {preview.ok ? (
        <p className="text-sm text-[var(--admin-navy)]">
          {preview.card.title}
          {preview.card.start_at ? ` · ${clockLabel(preview.card.start_at)}` : ""}
        </p>
      ) : fields.provider || fields.clientInfo || fields.arrivalFlightId || fields.departureFlightId ? (
        <p className="text-sm text-accent">{preview.error}</p>
      ) : (
        <p className="text-xs text-muted">L’aéroport et l’heure viennent du vol choisi.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voyageurs">
          <input
            inputMode="numeric"
            value={fields.passengers ?? ""}
            onChange={(event) => publish({ passengers: countValue(event.target.value, 1) })}
            className={control}
          />
        </Field>
        <Field label="Bagages">
          <input
            inputMode="numeric"
            value={fields.bags ?? ""}
            onChange={(event) => publish({ bags: countValue(event.target.value, 0) })}
            className={control}
          />
        </Field>
      </div>
      <Field label="Hotline">
        <input value={fields.hotline} onChange={(event) => publish({ hotline: event.target.value })} className={control} inputMode="tel" />
      </Field>
      <Field label="E-mail du prestataire">
        <input
          value={fields.email}
          onChange={(event) => publish({ email: event.target.value })}
          className={control}
          inputMode="email"
          autoComplete="off"
        />
      </Field>
      <Field label="Référence de réservation">
        <input
          value={fields.confirmation}
          onChange={(event) => publish({ confirmation: event.target.value })}
          className={control}
          autoComplete="off"
        />
      </Field>
      <Field label="Informations à transmettre au client">
        <textarea
          value={fields.clientInfo}
          onChange={(event) => publish({ clientInfo: event.target.value })}
          rows={8}
          className={`${control} h-auto py-3`}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Prix vendu (${currency}), facultatif`}>
          <MoneyInput value={price} onChange={(amount) => publish({ price: amount })} aria-label="Prix vendu" className={control} />
        </Field>
        <Field label="Devise">
          <select value={devise} onChange={(event) => publish({ devise: event.target.value })} className={control}>
            {(STAY_CURRENCIES as readonly string[]).includes(currency) ? null : <option value={currency}>{currency}</option>}
            {STAY_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
            {devise === "THB" ? null : <option value="THB">THB</option>}
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted">La confirmation se joint après validation, sur l’étape enregistrée.</p>
    </div>
  );
}

export function accueilDraft(item?: Partial<CrmBookingItem>): StepDraft {
  return {
    kind: "accueil_vip",
    title: item?.title || "Accueil VIP",
    supplier: item?.supplier || "",
    confirmation_ref: item?.confirmation_ref || "",
    start_at: item?.start_at || "",
    end_at: item?.end_at || "",
    amount: item?.amount ?? null,
    include_in_ledger: false,
    details: item?.details || { vip_service: "arrival", passenger_count: 1, bag_count: 0, client_info: "" },
  };
}
