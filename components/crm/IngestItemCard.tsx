"use client";

import type { BookingExtract } from "@/lib/crm/ingest-types";
import type { BookingItemKind } from "@/lib/crm/types";
import { BOOKING_ITEM_KINDS, BOOKING_ITEM_LABELS } from "@/lib/crm/types";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { Trash2 } from "lucide-react";

type ItemDraft = BookingExtract["items"][number];

function splitStamp(value: string) {
  const date = (value || "").slice(0, 10);
  const time = (value || "").match(/T(\d{2}:\d{2})/)?.[1] || "";
  return { date, time };
}

function joinStamp(date: string, time: string) {
  if (!date) return "";
  return time ? `${date}T${time}:00` : date;
}

function StampField({
  value,
  onChange,
  withTime = true,
}: {
  value: string;
  onChange: (next: string) => void;
  withTime?: boolean;
}) {
  const { date, time } = splitStamp(value);
  if (!withTime) {
    return <DateFrInput value={date} onChange={(next) => onChange(next)} />;
  }
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <DateFrInput value={date} onChange={(next) => onChange(joinStamp(next, time))} />
      <input
        type="time"
        lang="fr-FR"
        value={time}
        onChange={(event) => onChange(joinStamp(date, event.target.value))}
        className={`${fieldControlClass} w-[7.5rem]`}
        aria-label="Heure"
      />
    </div>
  );
}

function patchDetails(item: ItemDraft, key: string, value: string): ItemDraft {
  return { ...item, details: { ...item.details, [key]: value } };
}

function Text({
  placeholder,
  value,
  onChange,
  className = "",
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldControlClass} ${className}`}
    />
  );
}

export function IngestItemCard({
  item,
  onChange,
  onRemove,
}: {
  item: ItemDraft;
  onChange: (next: ItemDraft) => void;
  onRemove: () => void;
}) {
  const withTime =
    item.kind === "flight" ||
    item.kind === "rail" ||
    item.kind === "transfer" ||
    item.kind === "activity" ||
    item.kind === "car" ||
    item.kind === "cruise";
  const d = item.details || {};
  const included = Array.isArray(d.included) ? d.included.join("\n") : String(d.included || "");
  const rooms = Array.isArray(d.rooms)
    ? d.rooms
        .map((row) => [row.room || row.type, row.guests, row.confirmation_ref].filter(Boolean).join(" · "))
        .join("\n")
    : "";

  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-6">
        <select
          value={item.kind}
          onChange={(e) => onChange({ ...item, kind: e.target.value as BookingItemKind })}
          className={fieldControlClass}
        >
          {BOOKING_ITEM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {BOOKING_ITEM_LABELS[kind]}
            </option>
          ))}
        </select>
        <Text
          placeholder="Titre"
          value={item.title}
          onChange={(title) => onChange({ ...item, title })}
          className="sm:col-span-2"
        />
        <Text
          placeholder="Fournisseur"
          value={item.supplier || ""}
          onChange={(supplier) => onChange({ ...item, supplier })}
        />
        <Text
          placeholder="PNR / réf."
          value={item.confirmation_ref || ""}
          onChange={(confirmation_ref) => onChange({ ...item, confirmation_ref })}
        />
        <button type="button" className="justify-self-end text-accent" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="sm:col-span-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Début</p>
          <StampField
            value={item.start_at || ""}
            onChange={(start_at) => onChange({ ...item, start_at })}
            withTime={withTime}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Fin</p>
          <StampField
            value={item.end_at || ""}
            onChange={(end_at) => onChange({ ...item, end_at })}
            withTime={withTime}
          />
        </div>
        <Text
          placeholder="Prix vendu (optionnel)"
          value={item.amount == null ? "" : String(item.amount)}
          onChange={(raw) =>
            onChange({ ...item, amount: raw === "" ? null : Number(raw) })
          }
        />
      </div>

      {item.kind === "flight" ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <Text placeholder="Vol AF123" value={d.flight_number || ""} onChange={(v) => onChange(patchDetails(item, "flight_number", v))} />
          <Text placeholder="Opérateur" value={d.airline || ""} onChange={(v) => onChange(patchDetails(item, "airline", v))} />
          <Text placeholder="De (CDG)" value={d.from || ""} onChange={(v) => onChange(patchDetails(item, "from", v))} />
          <Text placeholder="Vers (RAK)" value={d.to || ""} onChange={(v) => onChange(patchDetails(item, "to", v))} />
          <Text placeholder="Ville départ" value={d.city_from || ""} onChange={(v) => onChange(patchDetails(item, "city_from", v))} />
          <Text placeholder="Ville arrivée" value={d.city_to || ""} onChange={(v) => onChange(patchDetails(item, "city_to", v))} />
          <Text placeholder="Classe" value={d.cabin || ""} onChange={(v) => onChange(patchDetails(item, "cabin", v))} />
          <Text placeholder="Bagages" value={d.baggage || ""} onChange={(v) => onChange(patchDetails(item, "baggage", v))} />
          <Text placeholder="Siège" value={d.seat || ""} onChange={(v) => onChange(patchDetails(item, "seat", v))} />
          <Text placeholder="Terminal" value={d.terminal || ""} onChange={(v) => onChange(patchDetails(item, "terminal", v))} />
        </div>
      ) : null}

      {item.kind === "hotel" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Text placeholder="Établissement" value={d.hotel_name || ""} onChange={(v) => onChange(patchDetails(item, "hotel_name", v))} />
          <Text placeholder="Ville" value={d.city || ""} onChange={(v) => onChange(patchDetails(item, "city", v))} />
          <textarea
            placeholder={"Chambres (une par ligne : type · occupants · réf.)"}
            value={rooms}
            onChange={(e) => {
              const next = e.target.value.split("\n").filter(Boolean).map((line) => {
                const [room, guests, confirmation_ref] = line.split("·").map((p) => p.trim());
                return { room, guests, confirmation_ref };
              });
              onChange({ ...item, details: { ...item.details, rooms: next } });
            }}
            className={`${fieldControlClass} min-h-[72px] sm:col-span-2`}
          />
          <textarea
            placeholder="Inclus — uniquement ce qui est écrit sur le doc"
            value={included}
            onChange={(e) =>
              onChange({
                ...item,
                details: {
                  ...item.details,
                  included: e.target.value.split("\n").map((p) => p.trim()).filter(Boolean),
                },
              })
            }
            className={`${fieldControlClass} min-h-[72px] sm:col-span-2`}
          />
          <Text placeholder="Occupation (2 adultes + 1 enfant)" value={d.occupancy || ""} onChange={(v) => onChange(patchDetails(item, "occupancy", v))} />
          <Text placeholder="Demandes spéciales" value={d.special_requests || ""} onChange={(v) => onChange(patchDetails(item, "special_requests", v))} />
        </div>
      ) : null}

      {item.kind === "transfer" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Text placeholder="Prise en charge" value={d.pickup || ""} onChange={(v) => onChange(patchDetails(item, "pickup", v))} />
          <Text placeholder="Destination" value={d.dropoff || ""} onChange={(v) => onChange(patchDetails(item, "dropoff", v))} />
          <Text placeholder="Sans heure clock (ex. 2 h 30 avant le vol)" value={d.pickup_note || ""} onChange={(v) => onChange(patchDetails(item, "pickup_note", v))} className="sm:col-span-2" />
        </div>
      ) : null}

      {item.kind === "rail" ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <Text placeholder="N° train" value={d.flight_number || ""} onChange={(v) => onChange(patchDetails(item, "flight_number", v))} />
          <Text placeholder="De" value={d.from || d.city_from || ""} onChange={(v) => onChange(patchDetails(item, "from", v))} />
          <Text placeholder="Vers" value={d.to || d.city_to || ""} onChange={(v) => onChange(patchDetails(item, "to", v))} />
          <Text placeholder="Classe / voiture" value={d.cabin || ""} onChange={(v) => onChange(patchDetails(item, "cabin", v))} />
        </div>
      ) : null}

      {item.kind === "car" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Text placeholder="Catégorie" value={d.vehicle || d.cabin || ""} onChange={(v) => onChange(patchDetails(item, "vehicle", v))} />
          <Text placeholder="Conducteur" value={d.driver || d.guests || ""} onChange={(v) => onChange(patchDetails(item, "driver", v))} />
          <Text placeholder="Prise" value={d.pickup || ""} onChange={(v) => onChange(patchDetails(item, "pickup", v))} />
          <Text placeholder="Restitution" value={d.dropoff || ""} onChange={(v) => onChange(patchDetails(item, "dropoff", v))} />
        </div>
      ) : null}

      {item.kind === "activity" || item.kind === "cruise" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Text placeholder="Lieu / meeting" value={d.meeting_point || d.city || ""} onChange={(v) => onChange(patchDetails(item, "meeting_point", v))} />
          <Text placeholder="Durée" value={d.duration || ""} onChange={(v) => onChange(patchDetails(item, "duration", v))} />
        </div>
      ) : null}
    </div>
  );
}
