import { hollowHotelCard } from "@/lib/crm/item-lifecycle";
import { findMatchingItem, type MatchableItem } from "@/lib/crm/item-match";
import { parsedItemsFromText } from "@/lib/crm/ingest-parse";
import { BOOKING_ITEM_LABELS, countsAsCarnetCard, type BookingItemKind } from "@/lib/crm/types";
import type { PlannedStep } from "@/lib/crm/email-step-plan";

type ServiceItem = MatchableItem & {
  amount?: number | string | null;
  details?: Record<string, unknown> | null;
};

type Traveler = { first_name?: string | null; last_name?: string | null };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

/** Corps du mail, ou le HTML débarrassé des balises. */
export function mailPlainText(textBody: string | null | undefined, html: string | null | undefined) {
  const plain = text(textBody);
  if (plain) return plain;
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function isDepositService(item: ServiceItem | null | undefined) {
  const kind = item?.kind || "";
  if (!kind || kind === "flight" || !countsAsCarnetCard(kind)) return false;
  if (!text(item?.title)) return false;
  if (hollowHotelCard(item || {})) return false;
  return Boolean(day(item?.start_at) || text(item?.confirmation_ref) || text(item?.supplier));
}

/** Le prix imprimé devient le coût. Le prix de vente du mail ne s’écrit pas. */
export function pricedAsCost<T extends ServiceItem>(item: T): T {
  const details = { ...(item.details || {}) };
  const cost = money(details.document_amount) ?? money(item.amount);
  if (cost == null) delete details.document_amount;
  else {
    details.document_amount = cost;
    if (!text(details.document_currency)) details.document_currency = "EUR";
  }
  return { ...item, amount: 0, details };
}

function named(rows: Traveler[] | null | undefined) {
  return (rows || []).some((row) => text(row.first_name) || text(row.last_name));
}

/**
 * Cartes hors vol à déposer. Une carte hôtel creuse est écartée.
 * Le corps du mail complète une location qui n’était pas dans l’extrait.
 * Les voyageurs déjà lus restent : le corps ne les remplace pas.
 */
export function readDepositServices(
  extract: { items?: ServiceItem[] | null; travelers?: Traveler[] | null } | null | undefined,
  bodyText: string
) {
  const stored = (extract?.items || []).filter((item) => isDepositService(item));
  const parsed = bodyText.trim() ? parsedItemsFromText(bodyText) : null;
  const fromBody = (parsed?.items || []).filter((item) => isDepositService(item));
  const merged: ServiceItem[] = [...stored];
  for (const item of fromBody) {
    if (!findMatchingItem(merged, item)) merged.push(item);
  }
  const travelers = named(extract?.travelers) ? extract?.travelers || [] : parsed?.travelers || [];
  return { items: merged.map((item) => pricedAsCost(item)), travelers };
}

export type ServicePreviewCard = {
  type: string;
  titre: string;
  dates: string;
  confirmation: string | null;
  cout: number | null;
};

export function planServiceDeposit(extract: { items?: ServiceItem[] | null } | null | undefined) {
  const cartes: ServicePreviewCard[] = readDepositServices(extract, "").items.map((item) => ({
    type: item.kind || "",
    titre: text(item.title),
    dates: (() => {
      const start = day(item.start_at);
      const end = day(item.end_at);
      if (start && end && end !== start) return `${start} → ${end}`;
      return start || end;
    })(),
    confirmation: text(item.confirmation_ref) || null,
    cout: money(item.details?.document_amount),
  }));
  return { cartes };
}

export type PliantSnap = { id: string; amount: number; label: string };

export type PliantProposal = { id: string; montant: number; libelle: string };

/** Même montant, au centime : on propose le rattachement, on ne l’écrit pas. */
export function matchPliantProposals(costs: number[], snaps: PliantSnap[]): PliantProposal[] {
  const used = new Set<string>();
  const out: PliantProposal[] = [];
  for (const cost of costs) {
    if (!Number.isFinite(cost) || cost <= 0) continue;
    const hit = snaps.find((row) => !used.has(row.id) && Math.abs(row.amount - cost) < 0.005);
    if (!hit) continue;
    used.add(hit.id);
    out.push({ id: hit.id, montant: cost, libelle: hit.label });
  }
  return out;
}

function euro(value: number) {
  const [whole, frac] = value.toFixed(2).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")},${frac}`;
}

function kindLabel(kind: string) {
  return BOOKING_ITEM_LABELS[kind as BookingItemKind] || "Prestation";
}

/** Ce que le clic a créé ou complété. Les cartes nouvelles restent cachées. */
export function cardsDepositMessage(steps: PlannedStep[], proposals: PliantProposal[]) {
  if (!steps.length) return "";
  const lines = steps.map((step) => {
    const verb = step.action === "completer" ? "complétée" : "créée";
    const sale =
      step.prix_vente > 0
        ? `prix de vente ${euro(step.prix_vente)} € inchangé`
        : "prix de vente 0 €";
    const cost = step.prix_fournisseur == null ? "sans coût imprimé" : `coût ${euro(step.prix_fournisseur)} €`;
    const when = step.dates ? `, ${step.dates}` : "";
    return `${kindLabel(step.type)} ${verb}, cachée, ${sale} : ${step.titre}${when}, ${cost}`;
  });
  const pliant =
    proposals.length === 1
      ? ` Une dépense Pliant de ${euro(proposals[0].montant)} € est déjà sur le dossier. Elle n’est pas rattachée : rattachez-la à la carte.`
      : proposals.length > 1
        ? " Des dépenses Pliant du même montant sont déjà sur le dossier. Elles ne sont pas rattachées."
        : "";
  return `${lines.join(" · ")}.${pliant} Aucun message. Aucun débit.`;
}
