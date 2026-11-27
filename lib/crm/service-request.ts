import type { SupabaseClient } from "@supabase/supabase-js";
import { TRAIN_DEFAULT_OUTBOUND, TRAIN_DEFAULT_RETURN, TRAIN_STATUS_LABEL, type TrainStatus } from "./train-request";

/** Demande de prestation. Le train est le premier type. L’avion reprendra le même modèle. */
export const SERVICE_KINDS = ["train", "flight"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export type ServiceSide = "avant" | "apres";

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  train: "Demande de train",
  flight: "Demande d’avion",
};

/** Types proposés sur « Ajouter une étape ». Ajouter une ligne suffit pour un futur transfert ou une voiture. */
export type ServiceStepOption = {
  kind: string;
  label: string;
  enabled: boolean;
  soon?: string;
};

export const SERVICE_STEP_OPTIONS: ServiceStepOption[] = [
  { kind: "train", label: "Train", enabled: true },
  { kind: "flight", label: "Avion", enabled: false, soon: "Bientôt" },
];

export function enabledServiceKind(kind: string): ServiceKind | null {
  const option = SERVICE_STEP_OPTIONS.find((row) => row.kind === kind && row.enabled);
  if (!option) return null;
  return option.kind === "flight" ? "flight" : option.kind === "train" ? "train" : null;
}

export type ServiceNeighbor = {
  id: string;
  kind: string;
  title?: string | null;
  city?: string | null;
  from?: string | null;
  to?: string | null;
  start?: string | null;
  end?: string | null;
  sortOrder?: number | null;
};

export function serviceKindOf(value: unknown): ServiceKind {
  return value === "flight" ? "flight" : "train";
}

export function serviceItemKind(kind: ServiceKind) {
  return kind === "flight" ? "flight" : "rail";
}

function day(value: string | null | undefined) {
  const raw = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function place(neighbor: ServiceNeighbor) {
  return (neighbor.city || neighbor.to || neighbor.from || neighbor.title || "").trim();
}

/**
 * Avant un hôtel : l’arrivée est la ville de l’hôtel, le jour est celui de l’arrivée.
 * Après un hôtel : le départ est la ville de l’hôtel, le jour est celui du départ.
 * Une autre carte suit la même règle : avant, on arrive où elle commence ; après, on part d’où elle finit.
 */
export function serviceRequestPrefill(input: {
  kind: ServiceKind;
  side: ServiceSide;
  neighbor: ServiceNeighbor;
  homeCity?: string | null;
}) {
  const home = (input.homeCity || "").trim();
  const city = place(input.neighbor);
  const start = day(input.neighbor.start);
  const end = day(input.neighbor.end) || start;
  const before = input.side === "avant";
  return {
    kind: input.kind,
    depart: before ? home : city,
    arrivee: before ? city : "",
    allerDate: before ? start : end,
    retourDate: before ? (end && end !== start ? end : "") : "",
    allerCreneau: TRAIN_DEFAULT_OUTBOUND,
    retourCreneau: TRAIN_DEFAULT_RETURN,
  };
}

export function insertionPlan(
  rows: { id: string; sort_order?: number | null }[],
  anchorId: string,
  side: ServiceSide
) {
  const anchor = rows.find((row) => row.id === anchorId);
  if (!anchor) return { error: "Carte introuvable." as const };
  const anchorSort = Number(anchor.sort_order || 0);
  const sortOrder = side === "avant" ? anchorSort : anchorSort + 1;
  const shifts = rows
    .filter((row) => row.id !== anchorId && Number(row.sort_order || 0) >= sortOrder)
    .map((row) => ({ id: row.id, sort_order: Number(row.sort_order || 0) + 1 }));
  if (side === "avant") shifts.push({ id: anchor.id, sort_order: anchorSort + 1 });
  return { sortOrder, shifts };
}

export function serviceRequestCard(input: {
  kind: ServiceKind;
  depart: string;
  arrivee: string;
  allerDate: string;
  sortOrder?: number | null;
  requestId: string;
}) {
  return {
    kind: serviceItemKind(input.kind),
    title: SERVICE_KIND_LABEL[input.kind],
    ...(input.sortOrder == null ? {} : { sort_order: input.sortOrder }),
    start_at: input.allerDate ? `${input.allerDate}T12:00:00` : null,
    amount: null,
    visible_to_client: false,
    include_in_ledger: false,
    details: {
      service_request: true,
      service_kind: input.kind,
      service_status: "nouvelle",
      client_hidden: true,
      city_from: input.depart,
      city_to: input.arrivee,
      train_request_id: input.requestId,
      price_mode: "sans",
    },
  };
}

export function isServiceRequest(details: Record<string, unknown> | null | undefined) {
  return details?.service_request === true;
}

export function serviceRequestStatusLabel(details: Record<string, unknown> | null | undefined) {
  const status = details?.service_status;
  if (typeof status !== "string" || !(status in TRAIN_STATUS_LABEL)) return "";
  return TRAIN_STATUS_LABEL[status as TrainStatus];
}

export function fulfilledTrainCard(input: {
  depart: string;
  arrivee: string;
  date: string;
  heureDepart: string;
  heureArrivee: string;
  numero: string;
  reference: string;
  prix: number;
  classe: string | null;
  tarif: string | null;
  requestId: string;
  voyageurs: number;
}) {
  const start = input.heureDepart.length === 5 ? input.heureDepart : "08:00";
  const end = input.heureArrivee.length === 5 ? input.heureArrivee : "10:00";
  return {
    kind: "rail" as const,
    title: `${input.depart} → ${input.arrivee}`,
    supplier: "SNCF",
    confirmation_ref: input.reference,
    start_at: `${input.date}T${start}:00`,
    end_at: `${input.date}T${end}:00`,
    amount: input.prix,
    visible_to_client: false,
    include_in_ledger: false,
    details: {
      service_request: false,
      service_kind: "train" as const,
      client_hidden: true,
      city_from: input.depart,
      city_to: input.arrivee,
      train_number: input.numero,
      classe: input.classe,
      tarif: input.tarif,
      train_request_id: input.requestId,
      amount_is_total: true,
      ticket_count: input.voyageurs || 1,
      price_mode: "avec",
    },
  };
}

export async function syncServiceCardStatus(admin: SupabaseClient, requestId: string, status: string) {
  const { data } = await admin.from("crm_train_requests").select("item_id").eq("id", requestId).maybeSingle();
  const itemId = (data as { item_id?: string | null } | null)?.item_id;
  if (!itemId) return;
  const item = await admin.from("crm_booking_items").select("details").eq("id", itemId).maybeSingle();
  const details = ((item.data as { details?: Record<string, unknown> } | null)?.details || {}) as Record<string, unknown>;
  if (details.service_request !== true) return;
  await admin.from("crm_booking_items").update({ details: { ...details, service_status: status } }).eq("id", itemId);
}
