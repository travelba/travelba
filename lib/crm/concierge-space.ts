import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifiedSpace } from "@/lib/crm/client-space-catalog";
import { CLIENT_SPACE_ACTIONS } from "@/lib/crm/client-space-catalog";
import { writeBillingAssignment } from "@/lib/crm/billing-companies";
import { isCompanyMember } from "@/lib/crm/company-role";
import { journalConciergeChange, type ConciergeTraveler } from "@/lib/crm/concierge-client-write";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { normalizeIban } from "@/lib/crm/billing";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { CLIENT_CANCEL_ADVISOR } from "@/lib/crm/le-cancel-copy";
import { greetingGivenName } from "@/lib/crm/identity";
import { foldName, firstNameOnlyMatches, firstNamesMatch, lastNamesMatch, nameTokens } from "@/lib/crm/person-match";
import { deleteTravelDocuments } from "@/lib/crm/travel-document-write";
import type { CrmBookingItem, CrmCustomer } from "@/lib/crm/types";
import type { HandoffKind } from "@/lib/crm/whatsapp-concierge";
import { HOTEL_ACCESS_COPY } from "@/lib/crm/hotel-access";

export type SpacePerformInput = {
  action: ClassifiedSpace;
  message: string;
  customerId: string;
  holder: boolean;
  staff: boolean;
  staffId: string | null;
  party: ConciergeTraveler[];
  hasFile: boolean;
  piecePath: string | null;
};

export type SpacePerformResult = {
  ok: boolean;
  summary: string;
  bookingId: string | null;
  handoff: HandoffKind | null;
  access: boolean;
  tool: string;
};

type CancelHotel = (input: {
  bookingId: string;
  customerId: string;
  visibleToClient: boolean;
  item: { id: string; kind: string; title: string | null; supplier: string | null };
  hotels: { id: string; kind: string; title: string | null }[];
}) => Promise<{ ok: boolean; sent?: boolean; message?: string }>;

export type SpaceDeps = {
  cancelHotel?: CancelHotel;
  requestAccess?: (customerId: string, enabled: boolean) => Promise<{ ok: boolean; error?: string; action?: string }>;
  sendStatement?: (customerId: string) => Promise<{ ok: boolean; message: string }>;
  runService?: (admin: SupabaseClient, input: SpacePerformInput, stayId: string) => Promise<{ ok: boolean; summary: string }>;
  shareStay?: (admin: SupabaseClient, input: SpacePerformInput, stayId: string) => Promise<{ ok: boolean; summary: string }>;
  depositFormality?: (admin: SupabaseClient, input: SpacePerformInput, stayId: string) => Promise<{ ok: boolean; summary: string }>;
  quoteTransfer?: (admin: SupabaseClient, input: SpacePerformInput, stayId: string) => Promise<{ ok: boolean; summary: string }>;
  detachCard?: (stripePaymentMethodId: string) => Promise<void>;
};

const IMPORT_REFUSAL = "L’import de documents se fait uniquement par l’agence.";
const PAY_COPY = "Le règlement se fait dans Transactions.";
const CARD_HOTEL = "La carte hôtel reste à l’agence.";
const PASSWORD_COPY = "Le mot de passe se choisit dans votre espace. Ce lien n’est pas un mot de passe.";
const FORMALITY_COPY = "Les réponses de la formalité se confirment dans votre espace.";
const HOTEL_PICK = "Cette offre se choisit dans Hôtels.";
const AGENDA_COPY = "L’agenda du séjour est sur votre carnet.";
const WELCOME_COPY = "La bienvenue se voit dans votre espace, après le mot de passe.";
const CARD_COPY = "La carte se saisit dans Facturation. Rien n’est enregistré depuis cette conversation.";
const SESSION_COPY = "La déconnexion se fait dans votre espace.";
const QUOTE_COPY = "Le devis du transfert se choisit dans le séjour, avec le véhicule.";
const SEARCH_COPY = "La recherche d’hôtels se fait dans votre espace.";
const DIRECT_COPY = "Ce séjour se désigne dans Hôtels.";

function result(
  input: SpacePerformInput,
  patch: Partial<SpacePerformResult> & { summary: string }
): SpacePerformResult {
  return {
    ok: patch.ok ?? false,
    summary: patch.summary,
    bookingId: "bookingId" in patch ? patch.bookingId ?? null : stayId(input),
    handoff: patch.handoff ?? null,
    access: patch.access ?? input.action.access,
    tool: input.action.tool,
  };
}

function stayId(input: SpacePerformInput) {
  const rows = input.action.reference
    ? input.party.filter((row) => row.reference.toUpperCase() === input.action.reference)
    : input.party;
  const ids = [...new Set(rows.map((row) => row.bookingId))];
  return ids.length === 1 ? ids[0] : null;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function named(input: SpacePerformInput) {
  const query = input.action.name;
  if (!query) return [];
  return input.party.filter((row) => travelerMatches(query, row));
}

function travelerMatches(query: string, row: ConciergeTraveler) {
  const tokens = nameTokens(query);
  if (tokens.length <= 1) return firstNameOnlyMatches(query, row.firstName) || firstNamesMatch(query, row.firstName);
  const given = tokens.slice(0, -1).join(" ");
  const last = tokens[tokens.length - 1];
  const givenOk = firstNameOnlyMatches(given, row.firstName) || firstNamesMatch(given, row.firstName);
  const lastOk = lastNamesMatch(last, row.lastName) || lastNamesMatch(last, row.usageName);
  return givenOk && lastOk;
}

const SHARE_PLACE_SKIP = new Set([
  "hotel",
  "sejour",
  "voyage",
  "reservation",
  "reservations",
  "carnet",
  "lien",
  "dossier",
  "avec",
  "pour",
  "dans",
  "votre",
  "cette",
  "plaza",
  "palace",
  "resort",
  "suite",
  "room",
  "whatsapp",
]);

export function shareNameList(names: string[]) {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

export function sharePersonLabel(person: { firstName: string | null; lastName: string | null; usageName: string | null }) {
  const given = greetingGivenName(person.firstName) || (person.firstName || "").trim();
  const family = (person.usageName || person.lastName || "").trim();
  return [given, family].filter(Boolean).join(" ") || "cette personne";
}

/** Prénom (le premier ou un autre), nom d’usage, nom d’épouse ou nom de famille. Casse et accents ignorés. */
export function sharePersonHit(
  query: string | null | undefined,
  person: { firstName: string | null; lastName: string | null; usageName: string | null }
) {
  const asked = nameTokens(query);
  if (!asked.length) return false;
  const known = new Set([
    ...nameTokens(person.firstName),
    ...nameTokens(person.lastName),
    ...nameTokens(person.usageName),
  ]);
  return asked.every((token) => known.has(token));
}

export function customersMatchingShareHint<
  T extends { first_name: string | null; last_name: string | null; usage_name?: string | null },
>(rows: T[], hint: string) {
  return rows.filter((row) =>
    sharePersonHit(hint, {
      firstName: row.first_name,
      lastName: row.last_name,
      usageName: row.usage_name ?? null,
    })
  );
}

function staysOf(party: ConciergeTraveler[]) {
  const map = new Map<string, ConciergeTraveler>();
  for (const row of party) if (!map.has(row.bookingId)) map.set(row.bookingId, row);
  return [...map.values()];
}

function placeTokens(row: ConciergeTraveler) {
  const found = new Set<string>();
  for (const value of [row.stayDestination, row.stayTitle]) {
    for (const word of foldName(value).split(" ")) {
      if (word.length >= 3 && !SHARE_PLACE_SKIP.has(word)) found.add(word);
    }
  }
  return [...found];
}

function hasPlaceWord(text: string, token: string) {
  if (token.length < 3) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(text);
}

/** « de Nice » est un lieu. « de Camille Martin » est une personne. */
function placeHintWord(message: string, addressee: string | null) {
  const after = /^(?:par|a|à|pour|du|de|et|sur|vers|au|aux|en|le|la|les|un|une|qui|que|dans)$/i;
  const re = /\bde\s+([\p{L}][\p{L}'’-]+)(?:\s+([\p{L}][\p{L}'’-]+))?/giu;
  for (const match of message.matchAll(re)) {
    const word = (match[1] || "").replace(/[.,!?;:]+$/g, "").trim();
    const next = match[2] || "";
    if (!word || fold(word) === fold(addressee || "") || SHARE_PLACE_SKIP.has(fold(word))) continue;
    if (next && !after.test(next) && /^\p{Lu}/u.test(next)) continue;
    return word;
  }
  return null;
}

function stayLabel(row: ConciergeTraveler) {
  const place = (row.stayDestination || row.stayTitle || "").trim();
  return place ? `${row.reference} (${place})` : row.reference;
}

export function pickShareStay(
  message: string,
  party: ConciergeTraveler[],
  reference: string | null,
  addressee?: string | null
): { ok: true; bookingId: string } | { ok: false; summary: string } {
  const stays = staysOf(party);
  if (reference) {
    const hit = stays.filter((row) => row.reference.toUpperCase() === reference.toUpperCase());
    if (hit.length === 1) return { ok: true, bookingId: hit[0].bookingId };
    return { ok: false, summary: "Je ne trouve pas ce séjour." };
  }
  if (!stays.length) return { ok: false, summary: "Sur quel séjour ?" };
  const text = fold(message);
  const named = stays.filter((row) => placeTokens(row).some((token) => hasPlaceWord(text, token)));
  if (named.length === 1) return { ok: true, bookingId: named[0].bookingId };
  if (named.length > 1) return { ok: false, summary: `Quel séjour : ${shareNameList(named.map(stayLabel))} ?` };
  const hint = placeHintWord(message, addressee ?? null);
  if (hint) return { ok: false, summary: `Je ne trouve pas le séjour de ${hint}.` };
  if (stays.length === 1) return { ok: true, bookingId: stays[0].bookingId };
  return { ok: false, summary: `Quel séjour : ${shareNameList(stays.map(stayLabel))} ?` };
}

export function pickShareCompanions(
  query: string | null,
  party: ConciergeTraveler[],
  bookingId: string
): { ok: true; companionId: string; label: string } | { ok: false; summary: string } {
  if (!query?.trim()) return { ok: false, summary: "Dites à qui envoyer le carnet." };
  const onStay = party.filter((row) => row.bookingId === bookingId);
  const hits = onStay.filter((row) => !row.isHolder && sharePersonHit(query, row));
  const ids = [...new Set(hits.map((row) => row.companionId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 1) {
    const row = hits.find((item) => item.companionId === ids[0]) || hits[0];
    return { ok: true, companionId: ids[0], label: sharePersonLabel(row) };
  }
  if (ids.length > 1) {
    const labels = ids.map((id) => sharePersonLabel(hits.find((row) => row.companionId === id) || hits[0]));
    return { ok: false, summary: `Plusieurs personnes correspondent : ${shareNameList(labels)}. Laquelle ?` };
  }
  if (hits.length) return { ok: false, summary: "Cet accompagnateur n’a pas de téléphone. Le lien reste à copier." };
  const holder = onStay.find((row) => row.isHolder && sharePersonHit(query, row));
  if (holder) return { ok: false, summary: `${sharePersonLabel(holder)} a déjà le carnet.` };
  return { ok: false, summary: "Je ne trouve pas cette personne sur ce séjour." };
}

function holderOnly(input: SpacePerformInput) {
  return input.holder;
}

function companyRole(row: { company_role?: string | null } | null): Pick<CrmCustomer, "company_role"> | null {
  if (!row) return null;
  const role = row.company_role === "admin" || row.company_role === "member" ? row.company_role : null;
  return { company_role: role };
}

export async function performClientSpace(
  admin: SupabaseClient,
  input: SpacePerformInput,
  deps: SpaceDeps = {}
): Promise<SpacePerformResult> {
  const id = input.action.id;
  if (id === "import_dossier" || id === "import_nouveau" || id === "import_piece_dossier") {
    return result(input, { summary: IMPORT_REFUSAL, access: false });
  }
  if (id === "carte_hotel") return result(input, { summary: CARD_HOTEL, access: false });
  if (id === "reglement_sejour") {
    return result(input, { summary: PAY_COPY, access: true, handoff: null });
  }
  if (id === "regler_encours") return payEncours(admin, input);
  if (id === "mot_de_passe") return result(input, { summary: PASSWORD_COPY, access: true });
  if (id === "formalite") return result(input, { summary: FORMALITY_COPY, access: true });
  if (id === "agenda_sejour" || id === "page_carnet") return result(input, { summary: AGENDA_COPY, access: true });
  if (id === "bienvenue") return result(input, { summary: WELCOME_COPY, access: true });
  if (id === "enregistrer_carte") return result(input, { summary: CARD_COPY, access: true });
  if (id === "journal_visite") return result(input, { summary: SESSION_COPY, access: true });
  if (id === "devis_chauffeur") return quoteTransfer(admin, input, deps);
  if (id === "demande_hotel" || id === "fiche_hotel" || id === "reserver_hotel" || id === "sejour_direct") {
    return result(input, { summary: id === "sejour_direct" ? DIRECT_COPY : HOTEL_PICK, access: true });
  }
  if (id === "recherche_hotel" || id === "suggerer_hotel") {
    return result(input, { summary: SEARCH_COPY, access: true });
  }
  if (id === "lire_voyageurs" || id === "voyageurs_hotel" || id === "page_accueil" || id === "page_reservations" || id === "lire_pieces" || id === "lire_piece" || id === "lire_releve") {
    return result(input, {
      summary: "C’est déjà dans votre espace, sur vos séjours.",
      access: true,
      ok: true,
    });
  }
  if (id === "annuler_hotel") return cancelHotel(admin, input, deps);
  if (id === "ajouter_accompagnateur") return addCompanion(admin, input);
  if (id === "retirer_accompagnateur") return removeCompanion(admin, input);
  if (id === "modifier_fiche" || id === "page_paiement") return updateProfile(admin, input);
  if (id === "retirer_piece") return removePiece(admin, input);
  if (id === "retirer_carte" || id === "carte_defaut") return paymentCard(admin, input, deps);
  if (id === "facturer_sejour") return billStay(admin, input);
  if (id === "acces_hotels") return hotelAccess(admin, input, deps);
  if (id === "envoyer_releve") return statement(admin, input, deps);
  if (id === "demander_service" || id === "deposer_formalite" || id === "partager_carnet") {
    return serviceOrShare(admin, input, deps);
  }
  const known = CLIENT_SPACE_ACTIONS.some((row) => row.id === id);
  return result(input, {
    summary: known ? "Je vous ouvre votre espace pour ce geste." : "Je n’ai pas reconnu ce geste.",
    access: true,
  });
}

async function note(
  admin: SupabaseClient,
  input: SpacePerformInput,
  summary: string,
  champs: string[],
  bookingId: string | null
) {
  await journalConciergeChange(admin, {
    summary,
    customerId: input.customerId,
    bookingId,
    staffId: input.staffId,
    voyageurId: named(input)[0]?.voyageurId || null,
    champs,
  });
}

async function cancelHotel(admin: SupabaseClient, input: SpacePerformInput, deps: SpaceDeps): Promise<SpacePerformResult> {
  if (!holderOnly(input)) {
    return result(input, { summary: CLIENT_CANCEL_ADVISOR, handoff: "cancel", access: false, bookingId: stayId(input) });
  }
  const bookingId = stayId(input);
  if (!bookingId) {
    return result(input, { summary: "Sur quel séjour dois-je regarder cet hôtel ?", access: false });
  }
  const { data: items } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, supplier, details")
    .eq("booking_id", bookingId);
  const hotels = ((items || []) as { id: string; kind: string; title: string | null; supplier: string | null; details: { hotel_name?: string } | null }[]).filter(
    (row) => row.kind === "hotel"
  );
  const wanted = fold(input.message);
  const matched = hotels.filter((row) => {
    const label = fold(row.details?.hotel_name || row.title || "");
    if (!label) return false;
    return wanted.includes(label) || label.split(" ").some((word) => word.length > 3 && wanted.includes(word));
  });
  const hotel = matched.length === 1 ? matched[0] : hotels.length === 1 ? hotels[0] : null;
  if (!hotel) {
    return result(input, { summary: "Quel hôtel dois-je annuler ?", access: false, bookingId });
  }
  const cancel = deps.cancelHotel || (await import("@/lib/crm/le-client-cancel")).cancelClientLeHotel;
  const outcome = await cancel({
    bookingId,
    customerId: input.customerId,
    visibleToClient: false,
    item: hotel as CrmBookingItem,
    hotels: hotels as CrmBookingItem[],
  });
  if (!outcome.ok) {
    return result(input, {
      summary: outcome.message || CLIENT_CANCEL_ADVISOR,
      handoff: "cancel",
      access: false,
      bookingId,
    });
  }
  const summary = `J’ai annulé l’hôtel${hotel.title ? ` ${hotel.title}` : ""}.`;
  await note(admin, input, summary, ["annulation"], bookingId);
  return result(input, { ok: true, summary, access: false, bookingId });
}

async function addCompanion(admin: SupabaseClient, input: SpacePerformInput): Promise<SpacePerformResult> {
  if (!input.holder) return result(input, { summary: "Seul le titulaire ajoute un voyageur.", access: false });
  const name = input.action.name;
  const parts = (name || "").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return result(input, { summary: "Nom et prénom requis.", access: false });
  const first = parts.slice(0, -1).join(" ");
  const last = parts[parts.length - 1];
  const { error } = await admin.from("crm_travel_companions").insert({
    customer_id: input.customerId,
    first_name: first,
    last_name: last,
  });
  if (error) return result(input, { summary: "Impossible d’ajouter ce voyageur.", access: false });
  const summary = `J’ai ajouté ${first} ${last} sur votre fiche.`;
  await note(admin, input, summary, ["accompagnateur"], null);
  return result(input, { ok: true, summary, access: false, bookingId: null });
}

async function removeCompanion(admin: SupabaseClient, input: SpacePerformInput): Promise<SpacePerformResult> {
  if (!input.holder) return result(input, { summary: "Seul le titulaire retire un voyageur.", access: false });
  const rows = named(input).filter((row) => !row.isHolder && row.companionId);
  const ids = [...new Set(rows.map((row) => row.companionId))];
  if (ids.length !== 1) {
    return result(input, { summary: ids.length ? "Plusieurs voyageurs correspondent. Précisez le nom." : "Je ne trouve pas ce voyageur sur vos séjours.", access: false });
  }
  await deleteTravelDocuments(admin, { companion_id: ids[0]!, customer_id: input.customerId });
  const { error } = await admin.from("crm_travel_companions").delete().eq("id", ids[0]!).eq("customer_id", input.customerId);
  if (error) return result(input, { summary: "Impossible de retirer ce voyageur.", access: false });
  const summary = `J’ai retiré ${input.action.name} de votre fiche.`;
  await note(admin, input, summary, ["accompagnateur"], rows[0]?.bookingId || null);
  return result(input, { ok: true, summary, access: false, bookingId: rows[0]?.bookingId || null });
}

async function updateProfile(admin: SupabaseClient, input: SpacePerformInput): Promise<SpacePerformResult> {
  if (!input.holder) return result(input, { summary: "Seul le titulaire modifie la fiche.", access: false });
  const text = input.message;
  const body: Record<string, unknown> = {};
  const iban = text.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i);
  if (iban && /\biban\b/i.test(text)) body.iban = normalizeIban(iban[0]);
  const address = text.match(/adresse est\s+(.+)$/i);
  if (address) body.address_line = address[1].replace(/[.!?]+$/g, "").trim().slice(0, 160);
  if (!Object.keys(body).length) {
    return result(input, { summary: "Dites le champ à modifier : adresse ou IBAN.", access: true });
  }
  const { patch, error } = customerPatchFromBody(body, { strictPhones: true });
  if (error) return result(input, { summary: error, access: false });
  delete patch.company_role;
  delete patch.billing_parent_id;
  delete patch.spending_allowance;
  const ibanTouched = "iban" in patch;
  if (ibanTouched) {
    const { error: ibanError } = await admin.from("crm_customers").update({ iban: patch.iban }).eq("id", input.customerId);
    if (ibanError) return result(input, { summary: "IBAN non enregistré.", access: false });
    delete patch.iban;
  }
  if (Object.keys(patch).length) {
    const { error: writeError } = await admin.from("crm_customers").update(patch).eq("id", input.customerId);
    if (writeError) return result(input, { summary: "Fiche non modifiée.", access: false });
  }
  const summary = ibanTouched ? "J’ai enregistré l’IBAN." : "J’ai mis à jour l’adresse.";
  await note(admin, input, summary, ibanTouched ? ["iban"] : ["adresse"], null);
  return result(input, { ok: true, summary, access: false, bookingId: null });
}

async function removePiece(admin: SupabaseClient, input: SpacePerformInput): Promise<SpacePerformResult> {
  const people = named(input);
  const companionId = people.length === 1 && !people[0].isHolder ? people[0].companionId : people.length === 1 ? null : undefined;
  if (people.length !== 1) {
    return result(input, { summary: people.length ? "Plusieurs voyageurs correspondent. Précisez le nom." : "De qui s’agit-il ?", access: false });
  }
  const { data } = await admin
    .from("crm_travel_documents")
    .select("id, doc_type, companion_id")
    .eq("customer_id", input.customerId);
  const text = fold(input.message);
  const docType = /passeport/.test(text) ? "passport" : /identit/.test(text) ? "id_card" : null;
  const rows = ((data || []) as { id: string; doc_type: string | null; companion_id: string | null }[]).filter((row) => {
    if (row.companion_id !== companionId) return false;
    return docType ? row.doc_type === docType : true;
  });
  if (rows.length !== 1) {
    return result(input, { summary: "Plusieurs pièces correspondent. Le coffre les distingue.", access: true });
  }
  const removed = await deleteTravelDocuments(admin, { id: rows[0].id, customer_id: input.customerId });
  if (removed.error) return result(input, { summary: "La pièce n’a pas été retirée.", access: false });
  const summary = `J’ai retiré la pièce de ${input.action.name || "ce voyageur"}.`;
  await note(admin, input, summary, ["piece"], people[0].bookingId);
  return result(input, { ok: true, summary, access: false, bookingId: people[0].bookingId });
}

async function paymentCard(admin: SupabaseClient, input: SpacePerformInput, deps: SpaceDeps): Promise<SpacePerformResult> {
  if (!input.holder) return result(input, { summary: "Seul le titulaire gère les cartes.", access: true });
  const { data } = await admin
    .from("crm_payment_methods")
    .select("id, last4, stripe_payment_method_id")
    .eq("customer_id", input.customerId);
  const cards = (data || []) as { id: string; last4: string | null; stripe_payment_method_id?: string | null }[];
  const digits = input.message.match(/\b(\d{4})\b/);
  const matched = digits ? cards.filter((row) => row.last4 === digits[1]) : cards;
  if (matched.length !== 1) {
    return result(input, { summary: "La carte se choisit dans Facturation.", access: true });
  }
  if (input.action.id === "carte_defaut") {
    await admin.from("crm_payment_methods").update({ is_default: false }).eq("customer_id", input.customerId);
    const { error } = await admin.from("crm_payment_methods").update({ is_default: true }).eq("id", matched[0].id).eq("customer_id", input.customerId);
    if (error) return result(input, { summary: "La carte n’a pas été choisie.", access: true });
    const summary = "J’ai choisi cette carte par défaut.";
    await note(admin, input, summary, ["carte"], null);
    return result(input, { ok: true, summary, access: false, bookingId: null });
  }
  const stripeId = matched[0].stripe_payment_method_id;
  if (stripeId && deps.detachCard) await deps.detachCard(stripeId);
  const { error } = await admin.from("crm_payment_methods").delete().eq("id", matched[0].id).eq("customer_id", input.customerId);
  if (error) return result(input, { summary: "La carte n’a pas été retirée.", access: true });
  const summary = "J’ai retiré la carte.";
  await note(admin, input, summary, ["carte"], null);
  return result(input, { ok: true, summary, access: false, bookingId: null });
}

async function billStay(admin: SupabaseClient, input: SpacePerformInput): Promise<SpacePerformResult> {
  const { data: customer } = await admin.from("crm_customers").select("id, company_role").eq("id", input.customerId).maybeSingle();
  if (isCompanyMember(companyRole(customer))) {
    return result(input, { summary: "Pour modifier la facturation société, contactez l’agence.", access: false, handoff: "question" });
  }
  const bookingId = stayId(input);
  if (!bookingId) return result(input, { summary: "Sur quel séjour dois-je facturer ?", access: false });
  const { data: companies } = await admin.from("crm_billing_companies").select("id").eq("customer_id", input.customerId);
  const list = (companies || []) as { id: string }[];
  if (list.length !== 1) {
    return result(input, { summary: "La société se choisit dans Facturation.", access: true, bookingId });
  }
  const written = await writeBillingAssignment(admin, { id: bookingId, customer_id: input.customerId }, { billing_company_id: list[0].id });
  if ("error" in written) return result(input, { summary: written.error, access: false, bookingId });
  const summary = "J’ai facturé ce séjour sur votre société.";
  await note(admin, input, summary, ["facturation"], bookingId);
  return result(input, { ok: true, summary, access: false, bookingId });
}

async function hotelAccess(admin: SupabaseClient, input: SpacePerformInput, deps: SpaceDeps): Promise<SpacePerformResult> {
  if (!input.holder) return result(input, { summary: HOTEL_ACCESS_COPY.reserved, access: false });
  const { data } = await admin.from("crm_customers").select("hotel_booking_enabled").eq("id", input.customerId).maybeSingle();
  const enabled = data?.hotel_booking_enabled === true;
  const request = deps.requestAccess || (await import("@/lib/crm/hotel-access-run")).requestHotelAccess;
  const outcome = await request(input.customerId, enabled);
  if (!outcome.ok) return result(input, { summary: outcome.error || "La demande n’a pas pu être envoyée.", access: false });
  const summary = HOTEL_ACCESS_COPY.sent;
  await note(admin, input, summary, ["hotels"], null);
  return result(input, { ok: true, summary, access: false, bookingId: null });
}

async function payEncours(admin: SupabaseClient, input: SpacePerformInput): Promise<SpacePerformResult> {
  const { data } = await admin.from("crm_customers").select("company_role").eq("id", input.customerId).maybeSingle();
  if (isCompanyMember(companyRole(data))) {
    return result(input, {
      summary: "Le règlement se fait depuis le compte qui porte l’encours.",
      access: true,
      handoff: null,
    });
  }
  return result(input, {
    summary: "Le règlement se confirme dans Transactions. Choisissez un moyen de règlement.",
    access: true,
    handoff: null,
  });
}

async function quoteTransfer(admin: SupabaseClient, input: SpacePerformInput, deps: SpaceDeps): Promise<SpacePerformResult> {
  const bookingId = stayId(input);
  if (!bookingId) return result(input, { summary: "Sur quel séjour ?", access: true });
  if (!deps.quoteTransfer) return result(input, { summary: QUOTE_COPY, access: true, bookingId });
  try {
    const done = await deps.quoteTransfer(admin, input, bookingId);
    return result(input, { ok: done.ok, summary: done.summary, access: true, bookingId });
  } catch (err) {
    const message = err instanceof BookingIssuesError ? err.issues[0]?.message || err.message : QUOTE_COPY;
    return result(input, { summary: message, access: true, bookingId });
  }
}

async function statement(admin: SupabaseClient, input: SpacePerformInput, deps: SpaceDeps): Promise<SpacePerformResult> {
  if (!input.holder) return result(input, { summary: "Seul le titulaire reçoit le relevé.", access: true, bookingId: null });
  if (!deps.sendStatement) {
    return result(input, { summary: "Le relevé part depuis Transactions. Je vous ouvre l’espace.", access: true });
  }
  const sent = await deps.sendStatement(input.customerId);
  if (sent.ok) await note(admin, input, sent.message, ["releve"], null);
  return result(input, { ok: sent.ok, summary: sent.message, access: !sent.ok, bookingId: null });
}

async function serviceOrShare(admin: SupabaseClient, input: SpacePerformInput, deps: SpaceDeps): Promise<SpacePerformResult> {
  if (input.action.id === "partager_carnet") {
    if (!input.holder && !input.staff) {
      return result(input, { summary: "Seul le titulaire envoie le carnet.", access: false, handoff: null });
    }
    const stay = pickShareStay(input.message, input.party, input.action.reference, input.action.name);
    if (!stay.ok) return result(input, { summary: stay.summary, access: false, bookingId: null, handoff: null });
    const who = pickShareCompanions(input.action.name, input.party, stay.bookingId);
    if (!who.ok) return result(input, { summary: who.summary, access: false, bookingId: stay.bookingId, handoff: null });
    if (!deps.shareStay) {
      return result(input, {
        summary: `Le lien du carnet pour ${who.label} se confirme dans le séjour publié.`,
        access: true,
        bookingId: stay.bookingId,
        handoff: null,
      });
    }
    const done = await deps.shareStay(admin, input, stay.bookingId);
    if (done.ok) await note(admin, input, done.summary, ["partage"], stay.bookingId);
    return result(input, { ok: done.ok, summary: done.summary, access: !done.ok, bookingId: stay.bookingId, handoff: null });
  }
  if (input.action.id === "deposer_formalite") {
    const bookingId = stayId(input);
    if (!bookingId) return result(input, { summary: "Sur quel séjour ?", access: false });
    if (!deps.depositFormality) {
      return result(input, {
        summary: input.hasFile ? "La formalité se dépose dans le séjour, si elle est due." : "Aucune formalité de visa sur ce message.",
        access: true,
        bookingId,
      });
    }
    const done = await deps.depositFormality(admin, input, bookingId);
    if (done.ok) await note(admin, input, done.summary, ["formalite"], bookingId);
    return result(input, { ok: done.ok, summary: done.summary, access: !done.ok, bookingId });
  }
  const bookingId = stayId(input);
  if (!bookingId) return result(input, { summary: "Sur quel séjour ?", access: false });
  if (!input.holder) return result(input, { summary: "Seul le titulaire demande ce service.", access: false, bookingId });
  if (!deps.runService) {
    return result(input, { summary: QUOTE_COPY, access: true, bookingId });
  }
  try {
    const done = await deps.runService(admin, input, bookingId);
    if (done.ok) await note(admin, input, done.summary, ["service"], bookingId);
    return result(input, { ok: done.ok, summary: done.summary, access: !done.ok, bookingId });
  } catch (err) {
    const message = err instanceof BookingIssuesError ? err.issues[0]?.message || err.message : "Ce service n’a pas été modifié.";
    return result(input, { summary: message, access: true, bookingId });
  }
}
