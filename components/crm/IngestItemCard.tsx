"use client";

import type { BookingExtract } from "@/lib/crm/ingest-types";
import type { BookingItemKind } from "@/lib/crm/types";
import { BOOKING_ITEM_KINDS, BOOKING_ITEM_LABELS, isExtraItemKind } from "@/lib/crm/types";
import { DateFrInput, Field, fieldControlClass } from "@/components/crm/fields";
import { BrandMark } from "@/components/crm/BrandMark";
import { applyRoomGuestLabels, guestsLabelFromKeys, type HouseholdMember } from "@/lib/crm/household";
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
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
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
  household = [],
}: {
  item: ItemDraft;
  onChange: (next: ItemDraft) => void;
  onRemove: () => void;
  household?: HouseholdMember[];
}) {
  const stampHasClock = (value: string) => {
    const match = (value || "").match(/T(\d{2}):(\d{2})/);
    return Boolean(match && !(match[1] === "00" && match[2] === "00"));
  };
  const withTime =
    item.kind === "flight" ||
    item.kind === "rail" ||
    item.kind === "transfer" ||
    item.kind === "car" ||
    item.kind === "cruise" ||
    (item.kind === "activity" &&
      (stampHasClock(item.start_at || "") || stampHasClock(item.end_at || "")));
  const d = item.details || {};
  const included = Array.isArray(d.included) ? d.included.join("\n") : String(d.included || "");
  const roomRows = Array.isArray(d.rooms) ? d.rooms : [];
  const kinds = BOOKING_ITEM_KINDS.filter((kind) => !isExtraItemKind(kind) || item.kind === kind);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {item.kind === "flight" || item.kind === "car" ? <BrandMark item={item} className="h-9 w-9" /> : null}
          <select
            value={item.kind}
            onChange={(e) => onChange({ ...item, kind: e.target.value as BookingItemKind })}
            className={`${fieldControlClass} max-w-[12rem]`}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {BOOKING_ITEM_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {d.needs_review ? (
            <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-navy)]">
              À vérifier
            </span>
          ) : null}
          <button type="button" className="text-accent" onClick={onRemove} aria-label="Retirer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {d.source_file_name ? (
        <p className="text-xs text-muted">Fichier : {d.source_file_name}</p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Libellé">
          <Text value={item.title} onChange={(title) => onChange({ ...item, title })} />
        </Field>
        <Field label={item.kind === "flight" ? "PNR" : "Référence"}>
          <Text
            value={item.confirmation_ref || ""}
            onChange={(confirmation_ref) => onChange({ ...item, confirmation_ref })}
          />
        </Field>
        <Field label="Début">
          <StampField
            value={item.start_at || ""}
            onChange={(start_at) => onChange({ ...item, start_at })}
            withTime={withTime}
          />
        </Field>
        <Field label="Fin">
          <StampField
            value={item.end_at || ""}
            onChange={(end_at) => onChange({ ...item, end_at })}
            withTime={withTime}
          />
        </Field>
        <Field label="Prix document">
          <Text
            value={d.document_amount == null ? "" : String(d.document_amount)}
            onChange={(raw) =>
              onChange({
                ...item,
                details: {
                  ...item.details,
                  document_amount: raw === "" ? null : Number(raw),
                },
              })
            }
          />
        </Field>
        <Field label="Devise document">
          <Text
            value={String(d.document_currency || "")}
            onChange={(v) => onChange(patchDetails(item, "document_currency", v))}
          />
        </Field>
        {item.kind === "flight" ? (
          <Field label="Nombre de billets">
            <Text
              value={d.ticket_count == null ? "" : String(d.ticket_count)}
              onChange={(raw) =>
                onChange({
                  ...item,
                  details: {
                    ...item.details,
                    ticket_count: raw === "" ? null : Math.max(1, Math.round(Number(raw)) || 1),
                  },
                })
              }
            />
          </Field>
        ) : null}
        <Field label={item.kind === "flight" ? "Prix unitaire par billet" : "Prix vendu (optionnel)"}>
          <Text
            value={item.amount == null ? "" : String(item.amount)}
            onChange={(raw) => onChange({ ...item, amount: raw === "" ? null : Number(raw) })}
          />
        </Field>
        {item.kind === "flight" ? (
          <p className="text-xs text-muted sm:col-span-2">
            Le séjour compte prix × billets. Sur un aller-retour, saisissez le prix sur un seul vol.
          </p>
        ) : null}
        <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)] sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(item.include_in_ledger)}
            onChange={(event) => onChange({ ...item, include_in_ledger: event.target.checked })}
          />
          <span>
            <span className="font-medium">Inclure dans les transactions</span>
            <span className="mt-0.5 block text-xs text-muted">
              Cette dépense entre dans l’encours. Décochez le montant du séjour si vous ne voulez pas le compter deux fois.
            </span>
          </span>
        </label>
        <Field label="Fournisseur">
          <Text
            value={item.supplier || ""}
            onChange={(supplier) => onChange({ ...item, supplier })}
          />
        </Field>
      </div>

      {item.kind === "flight" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="N° de vol">
            <Text value={d.flight_number || ""} onChange={(v) => onChange(patchDetails(item, "flight_number", v))} />
          </Field>
          <Field label="Opérateur">
            <Text value={d.airline || ""} onChange={(v) => onChange(patchDetails(item, "airline", v))} />
          </Field>
          <Field label="IATA départ">
            <Text value={d.from || ""} onChange={(v) => onChange(patchDetails(item, "from", v))} />
          </Field>
          <Field label="IATA arrivée">
            <Text value={d.to || ""} onChange={(v) => onChange(patchDetails(item, "to", v))} />
          </Field>
          <Field label="Ville départ">
            <Text value={d.city_from || ""} onChange={(v) => onChange(patchDetails(item, "city_from", v))} />
          </Field>
          <Field label="Ville arrivée">
            <Text value={d.city_to || ""} onChange={(v) => onChange(patchDetails(item, "city_to", v))} />
          </Field>
          <Field label="Classe">
            <Text value={d.cabin || ""} onChange={(v) => onChange(patchDetails(item, "cabin", v))} />
          </Field>
          <Field label="Bagages">
            <Text value={d.baggage || ""} onChange={(v) => onChange(patchDetails(item, "baggage", v))} />
          </Field>
        </div>
      ) : null}

      {item.kind === "hotel" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Établissement">
            <Text value={d.hotel_name || ""} onChange={(v) => onChange(patchDetails(item, "hotel_name", v))} />
          </Field>
          <Field label="Ville">
            <Text value={d.city || ""} onChange={(v) => onChange(patchDetails(item, "city", v))} />
          </Field>
          <Field label="Pension (si écrite)">
            <Text value={d.board || ""} onChange={(v) => onChange(patchDetails(item, "board", v))} />
          </Field>
          <Field label="Occupation">
            <Text value={d.occupancy || ""} onChange={(v) => onChange(patchDetails(item, "occupancy", v))} />
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-xs font-semibold text-muted">Chambres et voyageurs du foyer</p>
            {(roomRows.length ? roomRows : [{ room: "", guests: "", confirmation_ref: "", party_keys: [] }]).map(
              (room, index) => {
                const keys = Array.isArray(room.party_keys) ? room.party_keys : [];
                return (
                  <div key={index} className="space-y-2 rounded-xl border border-border p-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Text
                        value={room.room || room.type || ""}
                        onChange={(roomName) => {
                          const next = [...(roomRows.length ? roomRows : [{ ...room }])];
                          next[index] = { ...next[index], room: roomName };
                          onChange({ ...item, details: { ...item.details, rooms: next } });
                        }}
                      />
                      <Text
                        value={room.confirmation_ref || ""}
                        onChange={(confirmation_ref) => {
                          const next = [...(roomRows.length ? roomRows : [{ ...room }])];
                          next[index] = { ...next[index], confirmation_ref };
                          onChange({ ...item, details: { ...item.details, rooms: next } });
                        }}
                      />
                    </div>
                    {household.length ? (
                      <div className="flex flex-wrap gap-2">
                        {household.map((person) => {
                          const checked = keys.includes(person.key);
                          return (
                            <label key={person.key} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const nextKeys = checked
                                    ? keys.filter((key) => key !== person.key)
                                    : [...keys, person.key];
                                  const next = [...(roomRows.length ? roomRows : [{ ...room }])];
                                  next[index] = {
                                    ...next[index],
                                    party_keys: nextKeys,
                                    guests: guestsLabelFromKeys(nextKeys, household),
                                  };
                                  onChange({
                                    ...item,
                                    details: { ...item.details, rooms: applyRoomGuestLabels(next, household) },
                                  });
                                }}
                              />
                              {person.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        Choisissez un client pour attribuer les voyageurs du foyer.
                      </p>
                    )}
                  </div>
                );
              }
            )}
          </div>
          <Field label="Inclus — uniquement si écrit sur le document" className="sm:col-span-2">
            <textarea
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
              className={`${fieldControlClass} min-h-[72px]`}
            />
          </Field>
        </div>
      ) : null}

      {item.kind === "transfer" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Prise en charge">
            <Text value={d.pickup || ""} onChange={(v) => onChange(patchDetails(item, "pickup", v))} />
          </Field>
          <Field label="Destination">
            <Text value={d.dropoff || ""} onChange={(v) => onChange(patchDetails(item, "dropoff", v))} />
          </Field>
          <Field label="Note sans heure (ex. 2 h 30 avant le vol)">
            <Text value={d.pickup_note || ""} onChange={(v) => onChange(patchDetails(item, "pickup_note", v))} />
          </Field>
        </div>
      ) : null}

      {item.kind === "rail" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="N° de train">
            <Text value={d.flight_number || ""} onChange={(v) => onChange(patchDetails(item, "flight_number", v))} />
          </Field>
          <Field label="Classe / voiture">
            <Text value={d.cabin || ""} onChange={(v) => onChange(patchDetails(item, "cabin", v))} />
          </Field>
          <Field label="Gare départ">
            <Text value={d.from || d.city_from || ""} onChange={(v) => onChange(patchDetails(item, "from", v))} />
          </Field>
          <Field label="Gare arrivée">
            <Text value={d.to || d.city_to || ""} onChange={(v) => onChange(patchDetails(item, "to", v))} />
          </Field>
        </div>
      ) : null}

      {item.kind === "car" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Catégorie">
            <Text value={d.vehicle || d.cabin || ""} onChange={(v) => onChange(patchDetails(item, "vehicle", v))} />
          </Field>
          <Field label="Conducteur">
            <Text value={d.driver || d.guests || ""} onChange={(v) => onChange(patchDetails(item, "driver", v))} />
          </Field>
          <Field label="Prise">
            <Text value={d.pickup || ""} onChange={(v) => onChange(patchDetails(item, "pickup", v))} />
          </Field>
          <Field label="Restitution">
            <Text value={d.dropoff || ""} onChange={(v) => onChange(patchDetails(item, "dropoff", v))} />
          </Field>
        </div>
      ) : null}

      {item.kind === "activity" || item.kind === "cruise" || item.kind === "insurance" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {item.kind === "activity" || item.kind === "cruise" ? (
            <>
              <Field label="Lieu">
                <Text
                  value={d.meeting_point || d.city || ""}
                  onChange={(v) => onChange(patchDetails(item, "meeting_point", v))}
                />
              </Field>
              <Field label="Durée">
                <Text value={d.duration || ""} onChange={(v) => onChange(patchDetails(item, "duration", v))} />
              </Field>
            </>
          ) : null}
          <Field label="Détail — uniquement si écrit sur le document" className="sm:col-span-2">
            <textarea
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
              className={`${fieldControlClass} min-h-[72px]`}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
