import { roundTripPairs } from "@/lib/crm/flight-roundtrip";
import { hollowHotelCard } from "@/lib/crm/item-lifecycle";
import {
  findBlankStep,
  findHotelBookingCard,
  findHotelExactStay,
  findMatchingItem,
  type MatchableItem,
} from "@/lib/crm/item-match";
import { countsAsCarnetCard, isActiveItem } from "@/lib/crm/types";

export type StepCard = MatchableItem & {
  id: string;
  amount?: number | string | null;
  lifecycle?: string | null;
};

export type StepFieldChange = { champ: string; avant: string; apres: string };

export type PlannedStep = {
  action: "completer" | "creer";
  carte_id: string | null;
  type: string;
  titre: string;
  confirmation: string | null;
  dates: string;
  vol: string | null;
  trajet: string | null;
  prix_fournisseur: number | null;
  prix_vente: number;
  voyageurs: string[];
  changements: StepFieldChange[];
};

export type EmailStepPreview = {
  etapes: PlannedStep[];
  aller_retour: { pnr: string; lignes: string[] }[];
};

type Incoming = MatchableItem & { amount?: number | string | null };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function detail(item: MatchableItem | null | undefined, key: string) {
  return text(item?.details?.[key]);
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function day(value: string | null | undefined) {
  return (value || "").slice(0, 10);
}

function dateLabel(item: MatchableItem) {
  const start = day(item.start_at);
  const end = day(item.end_at);
  if (start && end && end !== start) return `${start} → ${end}`;
  return start || end || "";
}

function routeLabel(item: MatchableItem) {
  const from = detail(item, "from");
  const to = detail(item, "to");
  if (from && to) return `${from} → ${to}`;
  return null;
}

function namesOf(extract: { travelers?: { first_name?: string | null; last_name?: string | null }[] | null }) {
  return (extract.travelers || [])
    .map((row) => [row.first_name, row.last_name].filter(Boolean).join(" ").trim())
    .filter(Boolean);
}

function shown(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function differ(before: string, after: string) {
  const left = shown(before);
  const right = shown(after);
  if (!left || !right) return false;
  return left.localeCompare(right, "fr", { sensitivity: "accent" }) !== 0;
}

/** Un champ déjà rempli et différent est listé. Un champ vide est complété, sans être un écart. */
function fieldChanges(current: StepCard, incoming: Incoming): StepFieldChange[] {
  const rows: [string, string, string][] = [
    ["titre", current.title || "", incoming.title || ""],
    ["fournisseur", current.supplier || "", incoming.supplier || ""],
    ["confirmation", current.confirmation_ref || "", incoming.confirmation_ref || ""],
    ["début", day(current.start_at), day(incoming.start_at)],
    ["fin", day(current.end_at), day(incoming.end_at)],
    ["vol", detail(current, "flight_number"), detail(incoming, "flight_number")],
    ["départ", detail(current, "from"), detail(incoming, "from")],
    ["arrivée", detail(current, "to"), detail(incoming, "to")],
    ["compagnie", detail(current, "airline"), detail(incoming, "airline")],
  ];
  return rows
    .filter(([, before, after]) => differ(before, after))
    .map(([champ, avant, apres]) => ({ champ, avant: shown(avant), apres: shown(apres) }));
}

function salePrice(amount: number | string | null | undefined) {
  const parsed = money(amount);
  return parsed ?? 0;
}

/**
 * Aperçu des étapes d’un mail sur un dossier déjà ouvert.
 * Une étape vide du même type est remplie. Un aller-retour au même PNR reste une carte, une ligne par trajet.
 * Le prix de vente n’est pas repris du mail.
 */
export function planEmailSteps(
  existing: StepCard[],
  extract: {
    items?: Incoming[] | null;
    travelers?: { first_name?: string | null; last_name?: string | null }[] | null;
  }
): EmailStepPreview {
  const pool = existing.filter((row) => isActiveItem(row));
  const voyageurs = namesOf(extract);
  const ordered = [...(extract.items || [])].sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || "")));
  const etapes: PlannedStep[] = [];
  const legs: StepCard[] = [];

  ordered.forEach((raw, index) => {
    const kind = raw.kind || "";
    const title = (raw.title || "").trim();
    if (!title || !countsAsCarnetCard(kind)) return;
    if (hollowHotelCard(raw)) return;
    const probe = {
      kind,
      confirmation_ref: raw.confirmation_ref,
      start_at: raw.start_at,
      end_at: raw.end_at,
      title,
      supplier: raw.supplier,
      details: raw.details || null,
    };
    const match =
      findMatchingItem(pool, probe) ||
      findHotelExactStay(pool, probe) ||
      findHotelBookingCard(pool, probe) ||
      findBlankStep(pool, probe);
    const changements = match ? fieldChanges(match, raw) : [];
    if (match) {
      const idx = pool.findIndex((row) => row.id === match.id);
      if (idx >= 0) pool.splice(idx, 1);
      match.confirmation_ref = raw.confirmation_ref || match.confirmation_ref;
      match.details = {
        ...(match.details || {}),
        flight_number: detail(raw, "flight_number") || detail(match, "flight_number"),
        pnr: detail(raw, "pnr") || raw.confirmation_ref || detail(match, "pnr"),
      };
    }
    const prix = money(raw.details?.document_amount) ?? money(raw.amount);
    etapes.push({
      action: match ? "completer" : "creer",
      carte_id: match?.id ?? null,
      type: kind,
      titre: title,
      confirmation: text(raw.confirmation_ref) || null,
      dates: dateLabel(raw),
      vol: detail(raw, "flight_number") || null,
      trajet: routeLabel(raw),
      prix_fournisseur: prix,
      prix_vente: salePrice(match?.amount),
      voyageurs,
      changements,
    });
    legs.push({
      id: match?.id || `nouveau-${index}`,
      kind,
      title,
      supplier: raw.supplier,
      confirmation_ref: raw.confirmation_ref,
      start_at: raw.start_at,
      end_at: raw.end_at,
      details: raw.details || null,
      lifecycle: "active",
    });
  });

  const aller_retour = roundTripPairs(legs).map((pair) => ({
    pnr: text(pair.outbound.confirmation_ref) || detail(pair.outbound, "pnr"),
    lignes: [pair.outbound.title || "", pair.inbound.title || ""].filter(Boolean),
  }));

  return { etapes, aller_retour };
}
