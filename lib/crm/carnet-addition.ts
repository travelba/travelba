import type { SupabaseClient } from "@supabase/supabase-js";
import { decideTouchpointDelivery } from "./concierge-touchpoints";
import { toE164 } from "./phone";
import { siteConfig } from "../site";
import { countsAsCarnetCard } from "./types";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";

/** Relance préparée. Le cron des touchpoints ne la connaît pas : rien ne part seul. */
export const CARNET_ADDITION_KIND = "carnet_ajout";

export const CARNET_ADDITION_LABEL = "Ajout au carnet";

const KIND_ORDER = ["flight", "rail", "hotel", "transfer", "car", "cruise", "activity", "accueil_vip", "insurance"] as const;

const KIND_WORDS: Record<(typeof KIND_ORDER)[number], { one: string; many: string; feminine: boolean }> = {
  flight: { one: "votre vol", many: "vos vols", feminine: false },
  rail: { one: "votre train", many: "vos trains", feminine: false },
  hotel: { one: "votre hôtel", many: "vos hôtels", feminine: false },
  transfer: { one: "votre transfert", many: "vos transferts", feminine: false },
  car: { one: "votre voiture", many: "vos voitures", feminine: true },
  cruise: { one: "votre croisière", many: "vos croisières", feminine: true },
  activity: { one: "votre activité", many: "vos activités", feminine: true },
  accueil_vip: { one: "votre accueil à l’aéroport", many: "vos accueils à l’aéroport", feminine: false },
  insurance: { one: "votre assurance", many: "vos assurances", feminine: true },
};

export type CarnetAdditionCard = { id: string; kind: string };

type StoredCard = { id?: unknown; kind?: unknown };

export type CarnetAdditionDraft =
  | { prepared: false; raison: string }
  | { prepared: true; envoye: false; message: string; suivi_id: string; prestations: number };

function joinFr(parts: string[]) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} et ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** Phrase courte. Seulement le type de prestation : pas de nom, pas de prix, pas de fournisseur. */
export function carnetAdditionBody(kinds: string[], reference: string) {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    if (!countsAsCarnetCard(kind) || !(kind in KIND_WORDS)) continue;
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const parts = KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => {
    const count = counts.get(kind) || 0;
    const word = KIND_WORDS[kind];
    return { text: count > 1 ? word.many : word.one, feminine: word.feminine };
  });
  if (!parts.length) return "";
  const list = joinFr(parts.map((part) => part.text));
  const singular = parts.length === 1 && !parts[0].text.startsWith("vos ");
  const feminine = parts.every((part) => part.feminine);
  const verb = singular
    ? feminine
      ? "a été ajoutée"
      : "a été ajouté"
    : feminine
      ? "ont été ajoutées"
      : "ont été ajoutés";
  const sentence = `${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb} à votre carnet.`;
  const ref = reference.trim();
  if (!ref) return sentence;
  return `${sentence}\n${siteConfig.url}/mon-compte/reservations/${encodeURIComponent(ref)}`;
}

function readCards(payload: unknown): CarnetAdditionCard[] {
  if (!payload || typeof payload !== "object") return [];
  const cards = (payload as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return [];
  const out: CarnetAdditionCard[] = [];
  for (const row of cards as StoredCard[]) {
    const id = typeof row?.id === "string" ? row.id : "";
    const kind = typeof row?.kind === "string" ? row.kind : "";
    if (!id || !countsAsCarnetCard(kind)) continue;
    out.push({ id, kind });
  }
  return out;
}

function mergeCards(current: CarnetAdditionCard[], incoming: CarnetAdditionCard[], replace: boolean) {
  const map = new Map<string, CarnetAdditionCard>();
  for (const card of replace ? incoming : [...current, ...incoming]) {
    if (!card.id || !countsAsCarnetCard(card.kind)) continue;
    map.set(card.id, { id: card.id, kind: card.kind });
  }
  return [...map.values()];
}

type FollowupRow = {
  id: string;
  status: string;
  slot: string | null;
  payload: unknown;
};

/**
 * Un brouillon par dossier tant qu’il n’est pas envoyé.
 * Plusieurs ajouts rapprochés réécrivent le même texte. Aucun envoi.
 */
export async function queueCarnetAdditionDraft(
  admin: SupabaseClient,
  input: { bookingId: string; cards: CarnetAdditionCard[]; replace?: boolean }
): Promise<CarnetAdditionDraft> {
  const incoming = mergeCards([], input.cards, true);
  if (!incoming.length) return { prepared: false, raison: "Aucune prestation n’est montrée dans le carnet." };
  const booking = await admin
    .from("crm_bookings")
    .select("id, reference, visible_to_client, archived_at, customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (booking.error || !booking.data) return { prepared: false, raison: "Dossier introuvable." };
  const stay = booking.data as {
    id: string;
    reference: string | null;
    visible_to_client: boolean | null;
    archived_at: string | null;
    customer_id: string | null;
  };
  if (stay.archived_at) return { prepared: false, raison: "Ce séjour est archivé." };
  if (stay.visible_to_client !== true) return { prepared: false, raison: "Le carnet n’est pas encore montré au client." };
  if (!stay.customer_id || !stay.reference) return { prepared: false, raison: "Dossier introuvable." };
  const customer = await admin
    .from("crm_customers")
    .select("phone, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", stay.customer_id)
    .maybeSingle();
  if (customer.error || !customer.data) return { prepared: false, raison: "Pas de téléphone pour WhatsApp." };
  const person = customer.data as {
    phone?: string | null;
    whatsapp_opt_in_at?: string | null;
    whatsapp_opt_out_at?: string | null;
  };
  const phone = toE164(person.phone || "");
  if (!phone) return { prepared: false, raison: "Pas de téléphone pour WhatsApp." };
  if (!proactiveWhatsappAllowed(person)) return { prepared: false, raison: "Le client a coupé WhatsApp." };

  const listed = await admin
    .from("crm_concierge_followups")
    .select("id, status, slot, payload")
    .eq("phone", phone)
    .eq("kind", CARNET_ADDITION_KIND)
    .eq("booking_id", stay.id);
  if (listed.error) {
    console.error("[carnet] brouillon", listed.error.code || "error");
    return { prepared: false, raison: "Le brouillon n’est pas encore disponible." };
  }
  const rows = (listed.data || []) as FollowupRow[];
  const planned = rows.find((row) => row.status === "planned");
  const cards = mergeCards(planned ? readCards(planned.payload) : [], incoming, input.replace === true);
  const message = carnetAdditionBody(
    cards.map((card) => card.kind),
    stay.reference
  );
  if (!message) return { prepared: false, raison: "Aucune prestation n’est montrée dans le carnet." };
  const payload = { cards };
  const dueAt = new Date().toISOString();
  if (planned) {
    const saved = await admin
      .from("crm_concierge_followups")
      .update({
        draft_body: message,
        payload,
        due_at: dueAt,
        channel: "session",
        template_key: null,
        status: "planned",
      })
      .eq("id", planned.id)
      .eq("status", "planned")
      .select("id")
      .maybeSingle();
    if (saved.error || !saved.data) return { prepared: false, raison: "Le brouillon n’est pas encore disponible." };
    return { prepared: true, envoye: false, message, suivi_id: String((saved.data as { id: string }).id), prestations: cards.length };
  }
  const slot = rows.some((row) => (row.slot || "") === stay.id) ? `${stay.id}:${rows.length + 1}` : stay.id;
  const inserted = await admin
    .from("crm_concierge_followups")
    .insert({
      phone,
      customer_id: stay.customer_id,
      booking_id: stay.id,
      kind: CARNET_ADDITION_KIND,
      channel: "session",
      template_key: null,
      draft_body: message,
      due_at: dueAt,
      status: "planned",
      slot,
      payload,
    })
    .select("id")
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    const again = await admin
      .from("crm_concierge_followups")
      .select("id, status, slot, payload")
      .eq("phone", phone)
      .eq("kind", CARNET_ADDITION_KIND)
      .eq("booking_id", stay.id)
      .eq("status", "planned")
      .maybeSingle();
    const raced = again.data as FollowupRow | null;
    if (!again.error && raced?.id) {
      const merged = mergeCards(readCards(raced.payload), cards, false);
      const racedBody = carnetAdditionBody(
        merged.map((card) => card.kind),
        stay.reference
      );
      const healed = await admin
        .from("crm_concierge_followups")
        .update({ draft_body: racedBody, payload: { cards: merged }, due_at: dueAt, status: "planned" })
        .eq("id", raced.id)
        .eq("status", "planned")
        .select("id")
        .maybeSingle();
      if (!healed.error && healed.data) {
        return {
          prepared: true,
          envoye: false,
          message: racedBody,
          suivi_id: String((healed.data as { id: string }).id),
          prestations: merged.length,
        };
      }
    }
    console.error("[carnet] brouillon", inserted.error?.code || "error");
    return { prepared: false, raison: "Le brouillon n’est pas encore disponible." };
  }
  return {
    prepared: true,
    envoye: false,
    message,
    suivi_id: String((inserted.data as { id: string }).id),
    prestations: cards.length,
  };
}

/** Échec du brouillon : la carte reste enregistrée. Rien n’est envoyé. */
export async function noteCarnetAdditions(
  admin: SupabaseClient,
  bookingId: string,
  cards: CarnetAdditionCard[],
  options?: { replace?: boolean }
): Promise<CarnetAdditionDraft> {
  try {
    return await queueCarnetAdditionDraft(admin, { bookingId, cards, replace: options?.replace });
  } catch (err) {
    console.error("[carnet] brouillon", err instanceof Error ? err.message : "error");
    return { prepared: false, raison: "Le brouillon n’est pas encore disponible." };
  }
}

/** Clic agence. Hors fenêtre, le brouillon reste. Jamais de modèle non approuvé. */
export function decideFollowupDelivery(input: {
  kind: string;
  templateKey?: string | null;
  windowOpen: boolean;
  preview: boolean;
  dueAt: string;
  now: Date;
}): { send: true; mode: "session" } | { send: false; error: string } {
  if (input.kind === CARNET_ADDITION_KIND) {
    if (input.preview) return { send: false, error: "L’aperçu n’envoie pas." };
    if (!input.windowOpen) return { send: false, error: "Hors fenêtre de 24 h. Le message reste prêt." };
    return { send: true, mode: "session" };
  }
  return decideTouchpointDelivery(input);
}
