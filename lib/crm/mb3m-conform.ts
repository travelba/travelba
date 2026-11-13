/**
 * Facture MB3M conforme au fichier agence (activités du 12/11/2026, fournisseurs existants).
 * Le CRM ne crée aucun fournisseur. La billetterie (2, 1001, 27) ne part pas tant que
 * MB3M n’accepte pas CommissionId : `MB3M_FLIGHT_COMMISSION=1` ouvre ce chemin.
 */

import { agencyEmailHtml } from "@/lib/crm/email-html";
import { MB3M_AIRLINE_PROVIDERS, MB3M_PROVIDERS, type Mb3mCatalogProvider } from "@/lib/crm/mb3m-providers";
import type { Mb3mAccountLine } from "@/lib/crm/mb3m-account";
import type { Mb3mLine } from "@/lib/crm/mb3m";
import { siteConfig } from "@/lib/site";

/** Activités du fichier MB3M. 14 (frais généraux) n’est jamais une ligne de facture. */
export const MB3M_ACTIVITY = {
  directTicket: 1001,
  ftiTicket: 34,
  air: 2,
  insurance: 3,
  cruise: 20,
  land: 22,
  rail: 5,
  overhead: 14,
  hotel: 7,
  car: 8,
  lowCost: 27,
  ferry: 9,
  tourOperator: 11,
} as const;

/** Activités de billetterie aérienne refusées par MB3M (-22) tant que CommissionId n’est pas accepté. */
export const MB3M_FLIGHT_ACTIVITIES = new Set<number>([
  MB3M_ACTIVITY.air,
  MB3M_ACTIVITY.directTicket,
  MB3M_ACTIVITY.lowCost,
]);

export const MB3M_FLIGHT_HOLD_MESSAGE = "billetterie en attente de la mise à jour API MB3M";

export const MB3M_SUPPLIER_ALERT_EMAIL = "marie@travelba.fr";

/**
 * Table de commission, prête pour l’API. Code activité 141 = aérien, 147 = achat direct et low cost.
 * Désactivée tant que les lignes de vol ne partent pas.
 */
export const MB3M_COMMISSIONS = {
  141: {
    activityIds: [MB3M_ACTIVITY.air],
    france: { id: 6, label: "France à 0%" },
    international: { id: 1, label: "International à 0%" },
  },
  147: {
    activityIds: [MB3M_ACTIVITY.directTicket, MB3M_ACTIVITY.lowCost],
    france: { id: 44, label: "France à 0%" },
    international: { id: 45, label: "International à 0%" },
  },
} as const;

export type Mb3mCommissionScope = "france" | "international";
export type Mb3mFeeCode = "401" | "12" | "13" | "4";

const LOW_COST_IATA = new Set([
  "U2", "EC", "DS", "FR", "RK", "RR", "VY", "TO", "HV", "W6", "W9", "W4", "V7", "DY", "D8", "DI",
  "PC", "XQ", "X3", "EW", "LS", "BY", "3O", "G9", "FZ",
]);

const TRANSAVIA_FRANCE = "11c9b85d-e7fd-4106-be84-5843083d8e81";

/** Noms de fournisseurs.txt qui n’ont pas de ligne exacte dans l’export MB3M. */
export const MB3M_ALLOWED_SUPPLIER_GAPS = [
  "Fram / Plein Vent",
  "Costa Croisières",
  "OUIGO",
  "Présence assurance",
] as const;

export type Mb3mConformItem = {
  id?: string | null;
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  details?: Record<string, unknown> | null;
};

export function mb3mFlightLinesEnabled() {
  return process.env.MB3M_FLIGHT_COMMISSION === "1";
}

export function foldMb3mName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickProvider(list: Mb3mCatalogProvider[]) {
  const withAccount = list.filter((row) => row.account);
  return (withAccount.length ? withAccount : list)[0] || null;
}

export function mb3mProviderByName(name: string) {
  const key = foldMb3mName(name);
  if (!key) return null;
  const exact = MB3M_PROVIDERS.filter((row) => foldMb3mName(row.name) === key);
  return pickProvider(exact);
}

export function mb3mProviderById(id: string | null | undefined) {
  const key = (id || "").trim().toLowerCase();
  if (!key) return null;
  return MB3M_PROVIDERS.find((row) => row.id === key) || null;
}

/** Libellés de fournisseurs.txt sans correspondance exacte dans l’export. */
export function mb3mAllowedSupplierGaps(names: readonly string[] = MB3M_ALLOWED_SUPPLIER_GAPS) {
  return names.filter((name) => !mb3mProviderByName(name));
}

export function mb3mIsLowCostAirline(iata: string | null | undefined, name: string | null | undefined) {
  const code = (iata || "").trim().toUpperCase();
  if (code && LOW_COST_IATA.has(code)) return true;
  const folded = foldMb3mName(name);
  if (!folded) return false;
  return [
    "easyjet",
    "ryanair",
    "ryan air",
    "vueling",
    "transavia",
    "wizz",
    "volotea",
    "norwegian",
    "pegasus",
    "sun express",
    "jet2",
    "air arabia",
    "eurowings",
    "flydubai",
  ].some((needle) => folded.includes(needle));
}

export type Mb3mSaleChannel =
  | "amadeus"
  | "site"
  | "ouigo"
  | "trainline"
  | "little_emperors"
  | "expedia"
  | "cds"
  | "direct";

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Canal de réservation. Amadeus est le défaut d’un vol ou d’un train sans mention de site. */
export function mb3mSaleChannel(item: Mb3mConformItem): Mb3mSaleChannel {
  const details = item.details || {};
  const explicit = foldMb3mName(
    [detailText(details, "sale_channel"), detailText(details, "booked_on"), detailText(details, "channel"), detailText(details, "source")]
      .filter(Boolean)
      .join(" ")
  );
  const blob = foldMb3mName(
    [item.supplier, item.title, explicit, detailText(details, "provider"), detailText(details, "airline")].filter(Boolean).join(" ")
  );
  if (/\blittle emperors\b|\ble hotel\b/.test(explicit) || details.le_hotel_id) return "little_emperors";
  if (explicit.includes("expedia")) return "expedia";
  if (/(^| )cds( |$)/.test(explicit) || blob.includes("cdsgroupe")) return "cds";
  if (explicit.includes("trainline") || blob.includes("trainline")) return "trainline";
  if ((explicit.includes("ouigo") || blob.includes("ouigo")) && !explicit.includes("amadeus") && !blob.includes("amadeus")) {
    return "ouigo";
  }
  if (explicit.includes("amadeus") || explicit.includes("gds")) return "amadeus";
  if (/\b(site|internet|web|compagnie)\b/.test(explicit)) return "site";
  if (item.kind === "hotel") {
    if (blob.includes("little emperor")) return "little_emperors";
    if (blob.includes("expedia")) return "expedia";
    if (/(^| )cds( |$)/.test(blob)) return "cds";
    return "direct";
  }
  if (item.kind === "rail") {
    if (blob.includes("trainline")) return "trainline";
    if (blob.includes("ouigo") && !blob.includes("amadeus")) return "ouigo";
    return "amadeus";
  }
  if (item.kind === "flight" || item.kind === "low_cost") {
    if (item.kind === "low_cost") return "site";
    if (blob.includes("site internet") || blob.includes("site web")) return "site";
    return "amadeus";
  }
  return "direct";
}

export function mb3mChooseActivity(input: {
  kind?: string | null;
  channel?: string | null;
  airlineIata?: string | null;
  supplier?: string | null;
  title?: string | null;
}): number | null {
  const kind = (input.kind || "").trim();
  if (!kind || kind === "fee") return null;
  if (kind === "package" || kind === "stay") return MB3M_ACTIVITY.tourOperator;
  if (kind === "hotel") return MB3M_ACTIVITY.hotel;
  if (kind === "insurance") return MB3M_ACTIVITY.insurance;
  if (kind === "car") return MB3M_ACTIVITY.car;
  if (kind === "cruise") return MB3M_ACTIVITY.cruise;
  if (kind === "ferry" || kind === "maritime") return MB3M_ACTIVITY.ferry;
  if (kind === "rail") return MB3M_ACTIVITY.rail;
  if (kind === "low_cost") return MB3M_ACTIVITY.lowCost;
  if (kind === "flight") {
    const channel = input.channel || "amadeus";
    const onSite = channel === "site" || channel === "direct";
    if (onSite && mb3mIsLowCostAirline(input.airlineIata, input.supplier || input.title)) return MB3M_ACTIVITY.lowCost;
    if (onSite) return MB3M_ACTIVITY.directTicket;
    return MB3M_ACTIVITY.air;
  }
  if (["transfer", "activity", "chauffeur", "greeter", "accueil_vip", "visa", "checkin", "expense"].includes(kind)) {
    return MB3M_ACTIVITY.land;
  }
  return null;
}

function airlineIata(item: Mb3mConformItem) {
  const stored = detailText(item.details, "airline_iata").toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(stored)) return stored;
  const flight = detailText(item.details, "flight_number").toUpperCase();
  const match = flight.match(/^([A-Z0-9]{2})\s*\d/);
  return match?.[1] || "";
}

function airlineName(item: Mb3mConformItem) {
  const named = detailText(item.details, "airline");
  const supplier = (item.supplier || "").trim();
  if (named) return named;
  if (supplier && !/^amadeus$/i.test(supplier)) return supplier;
  return (item.title || "").trim();
}

/** TRANSAVIA, jamais TRANSAVIA FRANCE, même si le libellé dit « Transavia France ». */
export function mb3mTransaviaProvider() {
  const rows = MB3M_PROVIDERS.filter((row) => foldMb3mName(row.name) === "transavia" && row.id !== TRANSAVIA_FRANCE);
  const picked = pickProvider(rows);
  if (!picked || picked.id === TRANSAVIA_FRANCE) return null;
  return picked;
}

function airlineProvider(iata: string, name: string) {
  if (mb3mIsLowCostAirline(iata, name) && foldMb3mName(name).includes("transavia")) {
    return mb3mTransaviaProvider();
  }
  if (iata === "TO" || iata === "HV") return mb3mTransaviaProvider();
  const mapped = iata ? MB3M_AIRLINE_PROVIDERS[iata] : "";
  const fromIata = mapped ? mb3mProviderById(mapped) : null;
  if (fromIata && fromIata.id !== TRANSAVIA_FRANCE) return fromIata;
  const byName = name ? mb3mProviderByName(name) : null;
  if (byName && foldMb3mName(byName.name).includes("transavia")) return mb3mTransaviaProvider();
  return byName;
}

export type Mb3mSupplierResolution =
  | { ok: true; provider: Mb3mCatalogProvider; genericLand: boolean }
  | { ok: false; reason: string };

function found(provider: Mb3mCatalogProvider | null, genericLand = false): Mb3mSupplierResolution {
  if (!provider) return { ok: false, reason: "Fournisseur introuvable dans MB3M." };
  return { ok: true, provider, genericLand };
}

function missing(kind: string, name: string): Mb3mSupplierResolution {
  const who = name.trim() || "sans nom";
  return { ok: false, reason: `${kind} introuvable dans MB3M : ${who}.` };
}

export function resolveMb3mSupplier(input: {
  kind?: string | null;
  activityId: number | null;
  channel?: Mb3mSaleChannel | null;
  supplier?: string | null;
  title?: string | null;
  airlineIata?: string | null;
  airlineName?: string | null;
}): Mb3mSupplierResolution {
  const kind = input.kind || "";
  const name = (input.supplier || input.airlineName || input.title || "").trim();
  const activity = input.activityId;
  if (kind === "fee" || activity == null) return { ok: false, reason: "La ligne n’est pas une prestation fournisseur." };
  if (activity === MB3M_ACTIVITY.overhead) {
    return { ok: false, reason: "Les frais généraux ne sont pas une ligne de facture." };
  }
  if (activity === MB3M_ACTIVITY.air || activity === MB3M_ACTIVITY.directTicket || activity === MB3M_ACTIVITY.lowCost) {
    const provider = airlineProvider(input.airlineIata || "", input.airlineName || name);
    if (!provider || provider.id === TRANSAVIA_FRANCE) return missing("Compagnie", input.airlineName || name || input.airlineIata || "");
    return found(provider);
  }
  if (activity === MB3M_ACTIVITY.hotel) {
    if (input.channel === "little_emperors") return found(mb3mProviderByName("LITTLE EMPERORS"));
    if (input.channel === "expedia") return found(mb3mProviderByName("EXPEDIA"));
    if (input.channel === "cds") return found(mb3mProviderByName("CDS"));
    return found(mb3mProviderByName("HOTELS DIVERS"));
  }
  if (activity === MB3M_ACTIVITY.rail) {
    if (input.channel === "ouigo") return found(mb3mProviderByName("OUIGO direct"));
    if (input.channel === "trainline") return found(mb3mProviderByName("TRAINLINE"));
    return found(mb3mProviderByName("SNCF"));
  }
  if (activity === MB3M_ACTIVITY.insurance) {
    if (name && !foldMb3mName(name).includes("presence")) return missing("Assureur", name);
    return found(mb3mProviderByName("PRESENCE"));
  }
  if (activity === MB3M_ACTIVITY.car) {
    const folded = foldMb3mName(name);
    const named = ["AVIS", "HERTZ", "EUROPCAR", "BSP AUTO", "CENTRALE VOYAGES"].find((label) => folded.includes(foldMb3mName(label)));
    if (!named) return missing("Loueur", name);
    return found(mb3mProviderByName(named));
  }
  if (activity === MB3M_ACTIVITY.ferry) {
    if (name && !foldMb3mName(name).includes("corsica")) return missing("Compagnie maritime", name);
    return found(mb3mProviderByName("CORSICA FERRIES"));
  }
  if (activity === MB3M_ACTIVITY.cruise) {
    const folded = foldMb3mName(name);
    if (folded.includes("msc")) return found(mb3mProviderByName("MSC CROISIERES"));
    if (folded.includes("costa")) return missing("Compagnie de croisière", "Costa Croisières");
    return missing("Compagnie de croisière", name);
  }
  if (activity === MB3M_ACTIVITY.tourOperator) {
    const folded = foldMb3mName(name);
    const named = ["CLUB MED", "RECEPTIFS TOURCOM", "DISNEYLAND PARIS", "FRAM", "CENTRALE VOYAGES", "BEACHCOMBER HOLIDAYS", "TUI FRANCE"]
      .find((label) => folded.includes(foldMb3mName(label)));
    if (!named) return missing("Tour-opérateur", name);
    return found(mb3mProviderByName(named));
  }
  if (activity === MB3M_ACTIVITY.land) {
    const folded = foldMb3mName(`${name} ${input.title || ""} ${kind}`);
    if (folded.includes("blacklane")) return found(mb3mProviderByName("BLACKLANE"));
    if (kind === "greeter" || folded.includes("greeter")) return found(mb3mProviderByName("GREETER"));
    if (folded.includes("get your guide") || folded.includes("getyourguide")) return found(mb3mProviderByName("GET YOUR GUIDE"));
    if ((kind === "transfer" || kind === "chauffeur") && folded.includes("amadeus")) return found(mb3mProviderByName("AMADEUS TRANSFERT"));
    if (!name.trim()) return { ok: false, reason: "Le nom du fournisseur manque sur la ligne terrestre." };
    return found(mb3mProviderByName("DIVERS TERRESTRE"), true);
  }
  return missing("Fournisseur", name);
}

export function mb3mCommissionActivityCode(activityId: number | null | undefined): 141 | 147 | null {
  if (activityId === MB3M_ACTIVITY.air) return 141;
  if (activityId === MB3M_ACTIVITY.directTicket || activityId === MB3M_ACTIVITY.lowCost) return 147;
  return null;
}

/** Identifiant de commission à envoyer le jour où l’API l’accepte. Nul tant que les vols ne partent pas. */
export function mb3mCommissionId(activityId: number | null | undefined, scope: Mb3mCommissionScope = "international") {
  const code = mb3mCommissionActivityCode(activityId);
  if (!code) return null;
  return MB3M_COMMISSIONS[code][scope].id;
}

export function mb3mCommissionIdForSend(activityId: number | null | undefined, scope: Mb3mCommissionScope = "international") {
  if (!mb3mFlightLinesEnabled()) return null;
  return mb3mCommissionId(activityId, scope);
}

export function mb3mTicketRef(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function ticketRefs(details: Record<string, unknown> | null | undefined) {
  const raw = details?.ticket_numbers ?? details?.tickets ?? details?.ticket_number ?? details?.e_ticket;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((value) => mb3mTicketRef(value)).filter((value): value is string => Boolean(value));
}

export function mb3mFeeCode(input: { label?: string | null; amount?: number | null; items?: Mb3mConformItem[] }): Mb3mFeeCode {
  const label = foldMb3mName(input.label);
  if ((input.amount != null && input.amount < 0) || /remise|reduction|discount/.test(label)) return "4";
  if (label.includes("billeterie") || label.includes("billetterie")) return "401";
  const kinds = new Set((input.items || []).map((item) => item.kind).filter(Boolean));
  kinds.delete("fee");
  kinds.delete("expense");
  if (kinds.size && [...kinds].every((kind) => kind === "hotel")) return "12";
  if (kinds.size && [...kinds].every((kind) => kind === "flight" || kind === "rail" || kind === "low_cost")) return "401";
  return "13";
}

export function mb3mFeeLabel(code: Mb3mFeeCode, fallback?: string | null) {
  if (code === "4") return "Remise";
  if (code === "401") return "Frais Agence Billetterie";
  if (code === "12") return "Frais agence";
  if (code === "13") return (fallback || "").trim().match(/tourisme/i) ? (fallback || "").trim() : "Frais Agence Tourisme";
  return (fallback || "").trim() || "Frais agence";
}

function landLabel(label: string, supplier: string) {
  const clean = supplier.trim();
  if (!clean) return label;
  if (foldMb3mName(label).includes(foldMb3mName(clean))) return label.slice(0, 120);
  return `${label} · ${clean}`.slice(0, 120);
}

function bookingRef(item: Mb3mConformItem | null) {
  const ref = (item?.confirmation_ref || detailText(item?.details, "pnr") || "").trim();
  return ref.slice(0, 40);
}

function commissionScope(item: Mb3mConformItem | null): Mb3mCommissionScope {
  const scope = foldMb3mName(detailText(item?.details, "commission_scope") || detailText(item?.details, "fare_scope"));
  if (scope.includes("france") || scope === "domestic") return "france";
  return "international";
}

/** Pose l’activité, le fournisseur et la garde billetterie sur les lignes du grand livre. */
export function conformMb3mAccountLines(lines: Mb3mAccountLine[], items: Mb3mConformItem[]): Mb3mAccountLine[] {
  const byId = new Map(items.flatMap((item) => (item.id ? [[item.id, item] as const] : [])));
  return lines.map((line) => {
    const item = line.itemId ? byId.get(line.itemId) || null : null;
    const kind = item?.kind || line.chargeKind || "";
    if (line.rollup || (!item && (kind === "package" || kind === "stay"))) {
      return { ...line, rollup: true, activityId: MB3M_ACTIVITY.tourOperator, held: false, supplierReason: null };
    }
    if (kind === "fee" || line.chargeKind === "fee") {
      const code = mb3mFeeCode({ label: line.label, amount: line.amount, items });
      return {
        ...line,
        activityId: null,
        customCode: code,
        agencyProvider: true,
        providerId: null,
        margin: null,
        held: false,
        supplierReason: null,
        label: mb3mFeeLabel(code, line.label),
      };
    }
    const channel = item ? mb3mSaleChannel(item) : kind === "flight" ? "amadeus" : kind === "rail" ? "amadeus" : "direct";
    const iata = item ? airlineIata(item) : "";
    const carrier = item ? airlineName(item) : line.label;
    const activityId = mb3mChooseActivity({
      kind,
      channel,
      airlineIata: iata,
      supplier: item?.supplier || carrier,
      title: item?.title || line.label,
    });
    if (activityId == null) {
      return { ...line, activityId: null, held: false, supplierReason: "Activité MB3M inconnue.", providerId: null };
    }
    const supplierName = (item?.supplier || "").trim() || (kind === "flight" || kind === "low_cost" ? carrier : line.label);
    const supplier = resolveMb3mSupplier({
      kind,
      activityId,
      channel,
      supplier: supplierName,
      title: item?.title || line.label,
      airlineIata: iata,
      airlineName: carrier,
    });
    const held = MB3M_FLIGHT_ACTIVITIES.has(activityId) && !mb3mFlightLinesEnabled();
    const generic = supplier.ok && supplier.genericLand;
    const tickets = ticketRefs(item?.details);
    return {
      ...line,
      activityId,
      providerId: supplier.ok ? supplier.provider.id : null,
      providerName: supplier.ok ? supplier.provider.name : null,
      refPiece:
        activityId === MB3M_ACTIVITY.hotel || activityId === MB3M_ACTIVITY.land ? bookingRef(item) || null : tickets[0] || null,
      ticketRefs: tickets,
      refCommand: MB3M_FLIGHT_ACTIVITIES.has(activityId) ? bookingRef(item) || null : null,
      fareScope: commissionScope(item),
      held,
      supplierReason: supplier.ok ? null : supplier.reason,
      label: generic ? landLabel(line.label, supplierName) : line.label,
      customCode: null,
      agencyProvider: false,
    };
  });
}

export function mb3mSupplierBlock(lines: Mb3mAccountLine[]) {
  const reasons = lines.filter((line) => line.supplierReason && !line.rollup).map((line) => line.supplierReason || "");
  return [...new Set(reasons.filter(Boolean))].join(" ") || null;
}

export function mb3mSendableLines(lines: Mb3mAccountLine[]) {
  return lines.filter((line) => !line.held && !line.rollup && !line.supplierReason && (line.activityId != null || line.customCode));
}

export function mb3mInvoiceNotice(lines: Mb3mAccountLine[]) {
  return lines.some((line) => line.held) ? MB3M_FLIGHT_HOLD_MESSAGE : null;
}

export function mb3mInvoiceRefCommand(dossierRef: string, lines: Mb3mLine[]) {
  const commands = [...new Set(lines.map((line) => (line.refCommand || "").trim()).filter(Boolean))];
  if (commands.length === 1 && lines.some((line) => line.activityId != null && MB3M_FLIGHT_ACTIVITIES.has(line.activityId))) {
    return commands[0];
  }
  return dossierRef;
}

/** Ligne SOAP. Les frais d’agence sont Custom, sans marge. Les vols gardent la marge, jamais une commission, tant que l’envoi est coupé. */
export function mb3mConformInvoiceLine(line: Mb3mAccountLine, minNet: number): Mb3mLine {
  if (line.customCode) {
    const amount = Math.round(line.amount * 100) / 100;
    return {
      label: mb3mFeeLabel(line.customCode, line.label),
      quantity: 1,
      netPriceUnit: amount,
      netPriceTotal: amount,
      type: "Custom",
      customType: { complementary: line.customCode, lineType: 4 },
      providerRole: "agency",
      marginUnit: null,
    };
  }
  const raw = line.margin == null || !Number.isFinite(line.margin) ? null : line.margin;
  let net = raw == null ? line.amount : Math.round((line.amount - raw) * 100) / 100;
  let margin = raw;
  if (margin != null && net < minNet && line.amount >= minNet) {
    net = minNet;
    margin = Math.round((line.amount - minNet) * 100) / 100;
  }
  return {
    label: line.label,
    quantity: 1,
    netPriceUnit: net,
    netPriceTotal: net,
    activityId: line.activityId ?? undefined,
    type: "Standard",
    marginUnit: margin,
    note: line.note ?? null,
    providerId: line.providerId ?? null,
    providerRole: "supplier",
    refPiece: line.refPiece ?? null,
    refCommand: line.refCommand ?? null,
    commissionId: mb3mCommissionIdForSend(line.activityId, line.fareScope || "international"),
  };
}

/** Une ligne par billet (10 chiffres) quand la billetterie part. Le dernier centime reste sur la dernière ligne. */
export function mb3mSoapLines(lines: Mb3mAccountLine[], minNet: number): Mb3mLine[] {
  return mb3mSendableLines(lines).flatMap((line) => {
    const tickets = line.ticketRefs || [];
    const base = mb3mConformInvoiceLine(line, minNet);
    if (!mb3mFlightLinesEnabled() || tickets.length < 2 || line.activityId == null || !MB3M_FLIGHT_ACTIVITIES.has(line.activityId)) {
      return [base];
    }
    const count = tickets.length;
    return tickets.map((ticket, index) => {
      const share = (value: number) => {
        const cents = Math.round(value * 100);
        const part = Math.trunc(cents / count);
        const extra = index === count - 1 ? cents - part * count : 0;
        return (part + extra) / 100;
      };
      const net = share(base.netPriceUnit);
      const margin = base.marginUnit == null ? null : share(base.marginUnit);
      return { ...base, refPiece: ticket, netPriceUnit: net, netPriceTotal: net, marginUnit: margin };
    });
  });
}

export function mb3mSupplierAlertMail(input: { reference: string; bookingId: string; reason: string }) {
  const reference = input.reference.trim() || "dossier";
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 500);
  const href = `${siteConfig.url}/admin/reservations/${input.bookingId}`;
  const subject = `MB3M · fournisseur introuvable · ${reference}`.slice(0, 140);
  const intro = `La facture du dossier ${reference} n’a pas été créée : un fournisseur manque dans MB3M.`;
  const safeReason = reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = agencyEmailHtml({
    title: "Fournisseur MB3M",
    preheader: intro,
    bodyHtml: `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#0B192C">${intro}</p><p style="margin:0;font-size:15px;line-height:1.5;color:#0B192C">${safeReason}</p>`,
    ctaLabel: "Ouvrir le dossier",
    ctaHref: href,
    footnote: "Aucun fournisseur n’a été créé dans MB3M.",
  });
  const text = [subject, intro, reason, href, "Aucun fournisseur n’a été créé dans MB3M."].join("\n");
  return { to: MB3M_SUPPLIER_ALERT_EMAIL, subject, html, text };
}

export function mb3mAccountSyncCanSend(lines: Mb3mAccountLine[]) {
  const sendable = lines.filter((line) => !line.held && !line.rollup);
  if (!sendable.length) return false;
  return sendable.every((line) => line.agencyProvider || Boolean(line.providerId));
}
