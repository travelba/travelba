import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { carnetVisible, clientVisibleItems } from "@/lib/crm/carnet";
import type { SpaceDeps, SpacePerformInput } from "@/lib/crm/concierge-space";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";
import { stayTitleFromItems } from "@/lib/crm/staff-stay";
import { planTripShareSend, sendTripShareWhatsapp, tripShareUrl } from "@/lib/crm/trip-share";
import { ensureTripShareCode } from "@/lib/crm/trip-share-code";
import { customerFullName, type CrmBooking, type CrmBookingItem, type CrmBookingTraveler, type CrmCompanion, type CrmCustomer } from "@/lib/crm/types";
import { siteConfig } from "@/lib/site";
import type { ExtraKind, ExtraLeg, GreeterMoment, ServicePlace } from "@/lib/crm/extras";

/** Les mêmes fonctions que les routes de l’espace. Chargé seulement par le concierge en production. */
export async function liveSpaceDeps(): Promise<SpaceDeps> {
  return {
    sendStatement,
    runService,
    shareStay,
    depositFormality,
    quoteTransfer,
    detachCard,
  };
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function issueMessage(err: unknown, fallback: string) {
  if (err instanceof BookingIssuesError) return err.issues[0]?.message || err.message;
  return fallback;
}

function publicCopy(value: string) {
  return value.replace(/[A-Z0-9<]{9,}/gi, "").replace(/\d{6,}/g, "").replace(/\s+/g, " ").trim();
}

function addressesOf(message: string) {
  const match = message.match(/\bde\s+(.+?)\s+(?:à|a|vers)\s+(.+?)(?:[.!?]|$)/i);
  return { depart: match?.[1]?.trim() || "", arrive: match?.[2]?.trim() || "" };
}

function serviceAsk(message: string): {
  cancel: boolean;
  kind: ExtraKind | "visa" | "checkin";
  leg: ExtraLeg | null;
  place: ServicePlace | null;
  moment: GreeterMoment | null;
  depart: string;
  arrive: string;
} | null {
  const text = fold(message);
  let kind: ExtraKind | "visa" | "checkin" | null = null;
  if (/enregistrement|check-in|checkin/.test(text)) kind = "checkin";
  else if (/\bvisa\b|\besta\b|\beta\b/.test(text)) kind = "visa";
  else if (/vip|fastpass|greeter/.test(text)) kind = "greeter";
  else if (/chauffeur|transfert/.test(text)) kind = "chauffeur";
  if (!kind) return null;
  const addresses = addressesOf(message);
  const leg: ExtraLeg | null = kind === "checkin" || kind === "visa" ? null : /retour|arriv/.test(text) ? "arrival" : /aller|depart/.test(text) ? "departure" : null;
  const place: ServicePlace | null = kind !== "chauffeur" ? null : /domicile|maison/.test(text) ? "home" : /hotel/.test(text) ? "hotel" : null;
  const moment: GreeterMoment | null = kind !== "greeter" ? null : /arriv/.test(text) ? "arrive" : "depart";
  return { cancel: /\bannul/.test(text), kind, leg, place, moment, depart: addresses.depart, arrive: addresses.arrive };
}

async function visibleStay(admin: SupabaseClient, customerId: string, stayId: string) {
  const { data } = await admin.from("crm_bookings").select("*").eq("id", stayId).eq("customer_id", customerId).maybeSingle();
  if (!data) return null;
  const booking = data as CrmBooking;
  const { data: items } = await admin.from("crm_booking_items").select("*").eq("booking_id", stayId);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(booking, list)) return null;
  return { booking, items: list };
}

async function sendStatement(customerId: string) {
  const allowed = await rateLimit({
    key: rateLimitKey("releve:whatsapp", customerId),
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return { ok: false, message: RATE_LIMITED_MESSAGE };
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { loadClientLedger } = await import("@/lib/crm/client-ledger");
  const { buildStatement, statementHolderLines } = await import("@/lib/crm/statement");
  const { renderStatementPdf } = await import("@/lib/crm/statement-pdf");
  const { deliverStatementWhatsapp } = await import("@/lib/crm/statement-send");
  const admin = createServiceClient();
  const { data } = await admin.from("crm_customers").select("*").eq("id", customerId).maybeSingle();
  const customer = data as CrmCustomer | null;
  if (!customer) return { ok: false, message: "Le relevé part depuis Transactions. Je vous ouvre l’espace." };
  const view = await loadClientLedger(admin, customer, "client");
  const pdf = await renderStatementPdf(
    buildStatement({
      view,
      holderName: customerFullName(customer),
      holderLines: statementHolderLines(customer),
      issuedAt: new Date(),
    })
  );
  const sent = await deliverStatementWhatsapp({
    customerId: customer.id,
    phone: customer.phone,
    firstName: customer.first_name,
    member: view.member,
    pdf,
    audience: "client",
    optOutAt: customer.whatsapp_opt_out_at,
  });
  return { ok: sent.ok, message: sent.message };
}

async function runService(admin: SupabaseClient, input: SpacePerformInput, stayId: string) {
  const ask = serviceAsk(input.message);
  if (!ask) {
    return { ok: false, summary: "Indiquez un service (transfert, VIP Airport, enregistrement ou visa) et un trajet si besoin." };
  }
  const stay = await visibleStay(admin, input.customerId, stayId);
  if (!stay) return { ok: false, summary: "Séjour introuvable" };
  const [{ data: holder }, { data: travelers }, { data: companions }] = await Promise.all([
    admin.from("crm_customers").select("*").eq("id", input.customerId).maybeSingle(),
    admin.from("crm_booking_travelers").select("*").eq("booking_id", stayId),
    admin.from("crm_travel_companions").select("*").eq("customer_id", input.customerId),
  ]);
  if (!holder) return { ok: false, summary: "Séjour introuvable" };
  const { cancelBookingExtra, createBookingExtra } = await import("@/lib/crm/extras-write");
  try {
    if (ask.cancel) {
      await cancelBookingExtra(admin, {
        booking: stay.booking,
        items: stay.items,
        kind: ask.kind,
        leg: ask.leg,
        place: ask.place,
        moment: ask.moment,
      });
      return { ok: true, summary: "J’ai retiré ce service." };
    }
    const created = await createBookingExtra(admin, {
      booking: stay.booking,
      items: stay.items,
      travelers: (travelers || []) as CrmBookingTraveler[],
      holder: holder as CrmCustomer,
      companions: (companions || []) as CrmCompanion[],
      kind: ask.kind,
      leg: ask.leg,
      place: ask.place,
      moment: ask.moment,
      departAddress: ask.depart,
      arriveAddress: ask.arrive,
      enforceWindow: true,
    });
    if (ask.kind === "chauffeur" || ask.kind === "greeter" || ask.kind === "checkin") {
      try {
        const { notifyServiceRequest } = await import("@/lib/crm/service-request-mail");
        const { personLabel } = await import("@/lib/crm/household");
        const person = holder as CrmCustomer;
        await notifyServiceRequest({
          reference: stay.booking.reference,
          bookingId: stay.booking.id,
          holderName: personLabel(person.first_name, person.last_name) || "Client",
          currency: stay.booking.currency,
          amount: created.amount,
          reason: "validated",
          item: created.item,
          items: stay.items,
        });
      } catch {
        // Le service est demandé. Le mail d’agence ne bloque pas la confirmation.
      }
    }
    const summary =
      ask.kind === "checkin"
        ? "J’ai demandé l’enregistrement en ligne."
        : ask.kind === "visa"
          ? "J’ai demandé la formalité."
          : ask.kind === "greeter"
            ? "J’ai demandé l’accueil VIP."
            : "J’ai demandé le transfert.";
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, summary: issueMessage(err, "Ce service n’a pas été modifié.") };
  }
}

async function shareStay(admin: SupabaseClient, input: SpacePerformInput, stayId: string) {
  const stay = await visibleStay(admin, input.customerId, stayId);
  if (!stay?.booking.visible_to_client) return { ok: false, summary: "Ce voyage n’est pas publié" };
  const { data: customer } = await admin.from("crm_customers").select("phone, city").eq("id", input.customerId).maybeSingle();
  if (!customer?.phone?.trim()) return { ok: false, summary: "Ajoutez un téléphone dans Vous pour envoyer ce lien." };
  const named = input.party.filter((row) => !row.isHolder && row.companionId && row.bookingId === stayId && nameHits(input.action.name || "", row.firstName, row.lastName));
  const ids = [...new Set(named.map((row) => row.companionId))];
  if (ids.length !== 1) {
    return { ok: false, summary: ids.length ? "Plusieurs voyageurs correspondent. Précisez le nom." : "Accompagnateur introuvable sur ce voyage" };
  }
  const code = await ensureTripShareCode(admin, stay.booking.id);
  if (!code) return { ok: false, summary: "Ce voyage n’est pas publié" };
  const plan = planTripShareSend({
    companionId: ids[0]!,
    travelers: input.party
      .filter((row) => row.bookingId === stayId)
      .map((row) => ({ companion_id: row.companionId, is_account_holder: row.isHolder })),
    companions: input.party
      .filter((row) => row.companionId)
      .map((row) => ({ id: row.companionId!, first_name: row.firstName || "", phone: row.phone })),
  });
  if (!plan.ok) {
    if (plan.reason === "no_phone") return { ok: false, summary: "Cet accompagnateur n’a pas de téléphone. Le lien reste à copier." };
    return { ok: false, summary: "Accompagnateur introuvable sur ce voyage" };
  }
  const { liveConciergeImage, whatsappTypeImageUrl } = await import("@/lib/crm/concierge-notices");
  const mediaUrl = await liveConciergeImage(whatsappTypeImageUrl("partage"));
  const sent = await sendTripShareWhatsapp({
    phone: plan.phone,
    firstName: plan.firstName,
    title: stayTitleFromItems(stay.booking.title, stay.booking.destination, clientVisibleItems(stay.items), "Séjour", customer.city),
    url: tripShareUrl(siteConfig.url, code),
    mediaUrl,
  });
  if (sent.ok) return { ok: true, summary: `J’ai envoyé le carnet à ${plan.firstName}.` };
  if (sent.reason === "not_configured") return { ok: false, summary: "WhatsApp n’est pas disponible. Le lien reste à copier." };
  return { ok: false, summary: "WhatsApp n’a pas pu envoyer le message. Le lien reste à copier." };
}

function nameHits(query: string, first: string | null, last: string | null) {
  const folded = fold(query);
  const given = fold(first || "");
  const family = fold(last || "");
  if (!folded) return false;
  return folded.includes(given) && (!family || folded.includes(family) || given.includes(folded));
}

async function depositFormality(admin: SupabaseClient, input: SpacePerformInput, stayId: string) {
  if (!input.piecePath) return { ok: false, summary: "Ajoutez au moins un visa." };
  const stay = await visibleStay(admin, input.customerId, stayId);
  if (!stay) return { ok: false, summary: "Séjour introuvable" };
  const { data: travelers } = await admin.from("crm_booking_travelers").select("*").eq("booking_id", stayId);
  const party = (travelers || []) as CrmBookingTraveler[];
  const { frenchPassportTrip } = await import("@/lib/crm/visa-trip");
  const trip = frenchPassportTrip(stay.items, party.length);
  if (!trip.needsFormality) return { ok: false, summary: "Aucune formalité de visa sur ce séjour." };
  try {
    const { downloadCrmFile } = await import("@/lib/crm/files");
    const { saveVisaUploads } = await import("@/lib/crm/visa-save");
    const file = await downloadCrmFile(input.piecePath);
    const name = input.piecePath.split("/").pop() || "visa.pdf";
    const result = await saveVisaUploads(admin, {
      customerId: input.customerId,
      bookingId: stayId,
      travelers: party,
      countries: trip.entries.map((entry) => ({ iso: entry.iso, name: entry.name })),
      files: [new File([Buffer.from(file.bytes)], name, { type: file.contentType })],
    });
    if (result.saved > 0) {
      const { whatsappOnVisa } = await import("@/lib/crm/visa-flow");
      if (whatsappOnVisa("piece")) {
        const { markPaidVisasFiled } = await import("@/lib/crm/visa-post");
        const { notifyFormalitiesReady, safeConcierge } = await import("@/lib/crm/concierge-send");
        const { createServiceClient } = await import("@/lib/supabase/admin");
        const service = createServiceClient();
        await markPaidVisasFiled(service, stayId, result.countries, party);
        await safeConcierge(() => notifyFormalitiesReady(stayId, result.countries, service, { travelerIds: result.travelerIds }));
      }
      return { ok: true, summary: "J’ai déposé la formalité." };
    }
    const reason = publicCopy(result.errors[0] || "");
    return { ok: false, summary: reason || "La formalité n’a pas été déposée." };
  } catch (err) {
    const reason = publicCopy(err instanceof Error ? err.message : "");
    return { ok: false, summary: reason || "Envoi impossible" };
  }
}

async function quoteTransfer(admin: SupabaseClient, input: SpacePerformInput, stayId: string) {
  const text = fold(input.message);
  const leg = /retour|arriv/.test(text) ? "arrival" : /aller|depart/.test(text) ? "departure" : null;
  const place = /domicile|maison/.test(text) ? "home" : /hotel/.test(text) ? "hotel" : null;
  if (!leg || !place) return { ok: false, summary: "Indiquez le trajet du transfert." };
  const stay = await visibleStay(admin, input.customerId, stayId);
  if (!stay) return { ok: false, summary: "Séjour introuvable" };
  const addresses = addressesOf(input.message);
  const { quoteChauffeurOffer, publicChauffeurQuote } = await import("@/lib/crm/chauffeur-quote");
  try {
    const vehicles = await quoteChauffeurOffer({
      items: stay.items,
      leg,
      place,
      depart: addresses.depart,
      arrive: addresses.arrive,
      currency: stay.booking.currency || "EUR",
    });
    const labels = vehicles.map(publicChauffeurQuote).map((row) => row.label).filter(Boolean).slice(0, 4);
    if (!labels.length) return { ok: false, summary: "Aucun véhicule pour ce trajet." };
    return { ok: true, summary: `Véhicules proposés : ${labels.join(", ")}. Le choix se fait dans le séjour.` };
  } catch (err) {
    return { ok: false, summary: issueMessage(err, "Devis impossible") };
  }
}

async function detachCard(stripePaymentMethodId: string) {
  const { getStripe } = await import("@/lib/crm/stripe");
  const stripe = getStripe();
  if (!stripe || !stripePaymentMethodId) return;
  try {
    await stripe.paymentMethods.detach(stripePaymentMethodId);
  } catch {
    // déjà détachée
  }
}
