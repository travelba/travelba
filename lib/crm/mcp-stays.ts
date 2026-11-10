import { applyStay, type DirectEffect, type DirectStay, type StayEvent } from "@/lib/crm/hotel-direct";
import { runIfConfirmed } from "@/lib/crm/mcp-preview";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { visaResetPatch } from "@/lib/crm/visa-flow";
import type { VisaCorridor } from "@/lib/crm/visa-fees";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const STAY_ACTIONS = {
  repondre: "reply",
  paye: "mark_paid",
  lien_expire: "mark_link_expired",
  envoyer_carte: "send_card",
  prix: "price_ok",
  annuler: "cancel_agency",
  annuler_hotel: "cancel_hotel",
  rembourser: "refund_now",
} as const;

type StayAction = keyof typeof STAY_ACTIONS;

export function effectLabel(effect: DirectEffect) {
  if (effect.type === "mail") return `courrier ${effect.kind}`;
  if (effect.type === "refund_client") return `remboursement ${(effect.amountCents / 100).toFixed(2)}`;
  if (effect.type === "task") return effect.label;
  if (effect.type === "card") return "carte pour l’hôtel";
  if (effect.type === "capture") return "encaissement";
  if (effect.type === "release") return "libération de l’autorisation";
  if (effect.type === "lock_card") return "gel de la carte";
  if (effect.type === "debit") return "débit";
  if (effect.type === "void_debit") return "annulation du débit";
  if (effect.type === "draft") return "brouillon";
  return "effet";
}

export function describeStay(stay: DirectStay, event: StayEvent, now = new Date().toISOString()) {
  const step = applyStay(stay, event, now);
  if ("error" in step) throw new McpWriteError(step.error);
  const effets = step.effects.map(effectLabel);
  const envoie = step.effects.some((effect) => effect.type === "mail" || effect.type === "refund_client" || effect.type === "card");
  return {
    phase: step.stay.phase,
    effets,
    envoie,
    journal: step.audit.map((line) => line.detail),
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: unknown, label: string) {
  const id = text(value);
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function dossierOf(input: Record<string, unknown>) {
  const dossierId = text(input.dossier_id);
  const reference = text(input.reference);
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  return { dossierId, reference };
}

function stayEvent(input: Record<string, unknown>): StayEvent {
  const action = text(input.action) as StayAction;
  if (!STAY_ACTIONS[action]) throw new McpWriteError("Action inconnue.");
  if (action === "repondre") {
    const reply = text(input.texte).slice(0, 4000);
    if (reply.length < 2) throw new McpWriteError("La réponse de l’hôtel est vide.");
    return { type: "reply", text: reply };
  }
  if (action === "prix") {
    const euros = typeof input.prix_hotel === "number" ? input.prix_hotel : Number(String(input.prix_hotel || "").replace(",", "."));
    if (!Number.isFinite(euros) || euros < 0) throw new McpWriteError("Prix hôtel invalide.");
    return { type: "price_ok", hotelCents: Math.round(euros * 100) };
  }
  return { type: STAY_ACTIONS[action] } as StayEvent;
}

export async function sejourHotel(
  input: Record<string, unknown>,
  effects?: {
    preview: (input: Record<string, unknown>, event: StayEvent) => Promise<Record<string, unknown>>;
    apply?: (input: Record<string, unknown>, event: StayEvent) => Promise<Record<string, unknown>>;
  }
) {
  const clientId = uuid(input.client_id, "Client");
  const stayId = uuid(input.sejour_id, "Séjour");
  const event = stayEvent(input);
  const preview = await (effects?.preview ?? liveStayPreview)({ ...input, client_id: clientId, sejour_id: stayId }, event);
  return runIfConfirmed(input, { action: text(input.action), client_id: clientId, sejour_id: stayId, envoye: false, ...preview }, async () => {
    const done = await (effects?.apply ?? liveStayApply)({ ...input, client_id: clientId, sejour_id: stayId }, event);
    return { action: text(input.action), client_id: clientId, sejour_id: stayId, ecrit: true, apercu: false, ...preview, ...done };
  });
}

export function formalitePreview(country: VisaCorridor) {
  const patch = visaResetPatch();
  return {
    pays: country,
    etape: patch.step,
    envoie: false,
    message: "Le client revoit la carte de départ. Le remplissage en cours est effacé. Aucun message, aucun paiement.",
  };
}

export async function reprendreFormalite(
  input: Record<string, unknown>,
  effects?: {
    apply?: (input: { dossierId: string; reference: string; country: VisaCorridor }) => Promise<Record<string, unknown>>;
  }
) {
  const { dossierId, reference } = dossierOf(input);
  const country = text(input.pays);
  if (country !== "US" && country !== "GB" && country !== "IL") throw new McpWriteError("Pays non pris en charge.");
  const preview = formalitePreview(country);
  return runIfConfirmed(input, { action: "recommencer", ...preview }, async () => {
    const done = await (effects?.apply ?? liveFormaliteReset)({ dossierId, reference, country });
    return { action: "recommencer", ecrit: true, apercu: false, envoye: false, ...preview, ...done };
  });
}

export async function carteArrivee(
  input: Record<string, unknown>,
  effects?: {
    preview?: (input: { dossierId: string; reference: string; carteId: string }) => Promise<Record<string, unknown>>;
    apply?: (input: { dossierId: string; reference: string; carteId: string }) => Promise<Record<string, unknown>>;
  }
) {
  const { dossierId, reference } = dossierOf(input);
  const carteId = uuid(input.carte_id, "Carte");
  const request = { dossierId, reference, carteId };
  const preview = await (effects?.preview ?? liveArrivalPreview)(request);
  return runIfConfirmed(input, { action: "carte_arrivee", envoye: false, envoie: false, ...preview }, async () => {
    const done = await (effects?.apply ?? liveArrivalApply)(request);
    return { action: "carte_arrivee", ecrit: true, apercu: false, envoye: false, envoie: false, ...preview, ...done };
  });
}

type RateAction = "statut" | "prereserver" | "reserver" | "annuler";

export async function ratehawk(
  input: Record<string, unknown>,
  effects?: {
    read?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    preview?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    apply?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }
) {
  const action = text(input.action) as RateAction;
  if (action !== "statut" && action !== "prereserver" && action !== "reserver" && action !== "annuler") {
    throw new McpWriteError("Action inconnue.");
  }
  if (action === "statut") {
    const order = text(input.commande);
    if (!order) throw new McpWriteError("Réservation manquante.");
    return (effects?.read ?? liveRateStatus)(input);
  }
  if (action === "prereserver") {
    const hash = text(input.hash);
    const hid = Number(input.hid);
    const prix = typeof input.prix === "number" ? input.prix : Number(String(input.prix || "").replace(",", "."));
    if (!hash.startsWith("h-") || !Number.isInteger(hid) || !Number.isFinite(prix)) throw new McpWriteError("Tarif incomplet.");
  }
  if (action === "annuler" && !text(input.commande)) throw new McpWriteError("Réservation manquante.");
  if (action === "reserver") {
    if (!text(input.devis) || !Number.isInteger(Number(input.hid)) || !DAY.test(text(input.arrivee)) || !DAY.test(text(input.depart))) {
      throw new McpWriteError("Réservation incomplète.");
    }
  }
  const preview = await (effects?.preview ?? liveRatePreview)(input);
  return runIfConfirmed(input, { action, envoye: false, envoie: false, ...preview }, async () => {
    const done = await (effects?.apply ?? liveRateApply)(input);
    return { action, ecrit: true, apercu: false, envoye: false, envoie: false, ...preview, ...done };
  });
}

async function liveStayPreview(input: Record<string, unknown>, event: StayEvent) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createServiceClient()
    .from("crm_hotel_direct_stays")
    .select("state, phase")
    .eq("id", text(input.sejour_id))
    .eq("customer_id", text(input.client_id))
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Demande introuvable.");
  const state = data.state as DirectStay;
  return { hotel: state.hotelName || null, ...describeStay(state, event) };
}

async function liveStayApply(input: Record<string, unknown>, event: StayEvent) {
  const { actOnDirectStay } = await import("@/lib/crm/hotel-direct-run");
  const { recordAgencyJournal } = await import("@/lib/crm/agency-log");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const result = await actOnDirectStay({
    customerId: text(input.client_id),
    stayId: text(input.sejour_id),
    event,
    actor: "agency",
  });
  if (!result.ok) throw new McpWriteError(result.message);
  if (event.type === "refund_now") {
    const staffId = currentMcpAccess().staff?.id;
    if (staffId) {
      await recordAgencyJournal({
        staffId,
        action: "update",
        entityType: "finance",
        entityId: text(input.sejour_id),
        summary: "Remboursement du client lancé (séjour hôtel direct).",
        sensitive: "refund",
        path: "/api/mcp",
      });
    }
  }
  return { hotel: result.view.hotelName, envoye: event.type === "refund_now" || event.type === "send_card" };
}

async function liveFormaliteReset(input: { dossierId: string; reference: string; country: VisaCorridor }) {
  const booking = await loadBooking(input.dossierId, input.reference);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  const patch = visaResetPatch();
  const { error } = await admin.from("crm_visa_requests").update(patch).eq("booking_id", booking.id).eq("country", input.country);
  if (error) throw new McpWriteError("La demande n’a pas pu être recommencée.");
  await admin.from("crm_visa_portal_events").delete().eq("booking_id", booking.id).eq("country", input.country);
  return { dossier_id: booking.id, recommence: true };
}

async function liveArrivalPreview(input: { dossierId: string; reference: string; carteId: string }) {
  const booking = await loadBooking(input.dossierId, input.reference);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { data } = await createServiceClient()
    .from("crm_booking_items")
    .select("id, title, kind")
    .eq("id", input.carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (!data) throw new McpWriteError("Carte introuvable.");
  return {
    dossier_id: booking.id,
    hotel: data.title || null,
    message: "La carte d’arrivée du pré-check-in sera créée. Aucun numéro complet, aucun message à l’hôtel.",
  };
}

async function liveArrivalApply(input: { dossierId: string; reference: string; carteId: string }) {
  const booking = await loadBooking(input.dossierId, input.reference);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { issueHotelCheckinCard } = await import("@/lib/crm/hotel-desk-run");
  const card = await issueHotelCheckinCard(createServiceClient(), booking.id, input.carteId);
  const last4 = /^\d{4}$/.test(card.last4) ? card.last4 : null;
  return { dossier_id: booking.id, fin: last4, titulaire: card.holder };
}

async function liveRatePreview(input: Record<string, unknown>) {
  const action = text(input.action);
  if (action === "prereserver") {
    return { hid: Number(input.hid), prix: Number(input.prix), message: "La pré-réservation fige le tarif. La chambre n’est pas encore réservée." };
  }
  if (action === "annuler") {
    return { commande: text(input.commande), message: "La réservation Ratehawk sera annulée. Aucun message au client." };
  }
  const rooms = Array.isArray(input.chambres) ? input.chambres : [];
  const names = rooms.flatMap((room) => {
    const guests = room && typeof room === "object" && Array.isArray((room as { voyageurs?: unknown }).voyageurs) ? (room as { voyageurs: unknown[] }).voyageurs : [];
    return guests.map((guest) => {
      const row = guest && typeof guest === "object" ? (guest as { prenom?: unknown; nom?: unknown }) : {};
      return `${text(row.prenom)} ${text(row.nom)}`.trim();
    });
  }).filter(Boolean);
  return {
    hotel: text(input.hotel) || `Hôtel ${input.hid}`,
    arrivee: text(input.arrivee),
    depart: text(input.depart),
    voyageurs: names,
    message: "confirmer true réserve chez Ratehawk, en deposit, sans numéro de carte. Aucun message au client.",
  };
}

async function liveRateApply(input: Record<string, unknown>) {
  const action = text(input.action);
  const { prebookRate, startBooking, cancelBooking } = await import("@/lib/crm/ratehawk/book");
  if (action === "prereserver") {
    const result = await prebookRate(text(input.hash), Number(input.hid), Number(input.prix));
    if (!result.ok) throw new McpWriteError(result.error || "Tarif indisponible.");
    return { prix: result.price ?? null, reserve: false };
  }
  if (action === "annuler") {
    const result = await cancelBooking(text(input.commande), undefined, undefined, { touchCrm: true });
    if (!result.ok) throw new McpWriteError("error" in result && result.error ? String(result.error) : "L’annulation Ratehawk a échoué.");
    return { annule: true };
  }
  const rooms = guestRooms(input.chambres);
  const searched = Array.isArray(input.recherche)
    ? input.recherche.map((row) => {
        const item = row && typeof row === "object" ? (row as { adultes?: unknown; enfants?: unknown }) : {};
        return { adults: Number(item.adultes) || 0, children: Array.isArray(item.enfants) ? item.enfants.map(Number) : [] };
      })
    : [];
  const result = await startBooking({
    quoteToken: text(input.devis),
    hid: Number(input.hid),
    hotelName: text(input.hotel) || `Hôtel ${input.hid}`,
    checkin: text(input.arrivee),
    checkout: text(input.depart),
    residency: text(input.residence).toLowerCase(),
    searched,
    rooms,
    priceAccepted: input.prix_accepte === true,
    acceptFormPrice: input.accepter_prix === true,
    scenario: text(input.scenario) || null,
    dossier: text(input.dossier) || null,
    userIp: "mcp",
    phone: text(input.telephone),
    partnerOrderId: text(input.commande) || null,
  });
  if (!result.ok) throw new McpWriteError("error" in result && result.error ? String(result.error) : "La réservation Ratehawk a échoué.");
  return { commande: "partner_order_id" in result ? result.partner_order_id : null, statut: result.status };
}

async function liveRateStatus(input: Record<string, unknown>) {
  const { pollBooking } = await import("@/lib/crm/ratehawk/book");
  const result = await pollBooking(text(input.commande), undefined, undefined, { linkCrm: true });
  if (!result.ok) throw new McpWriteError("Le statut Ratehawk est indisponible.");
  return { action: "statut", commande: text(input.commande), statut: result.status, ecrit: false, envoye: false };
}

function guestRooms(value: unknown) {
  if (!Array.isArray(value)) throw new McpWriteError("Réservation incomplète.");
  return value.map((room) => {
    const guests = room && typeof room === "object" && Array.isArray((room as { voyageurs?: unknown }).voyageurs) ? (room as { voyageurs: unknown[] }).voyageurs : [];
    return {
      guests: guests.map((guest) => {
        const row = guest && typeof guest === "object" ? (guest as Record<string, unknown>) : {};
        return {
          first_name: text(row.prenom),
          last_name: text(row.nom),
          is_child: row.enfant === true,
          age: row.age == null ? undefined : Number(row.age),
        };
      }),
    };
  });
}

async function loadBooking(dossierId: string, reference: string) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const query = createServiceClient().from("crm_bookings").select("id, reference");
  const filtered = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
  const { data, error } = await filtered.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = data || [];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}
