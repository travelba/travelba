import type { SupabaseClient } from "@supabase/supabase-js";
import { runIfConfirmed } from "./mcp-preview";
import { McpWriteError } from "./mcp-write";
import { notifyTrainBot } from "./train-bot";
import { ageOnDate, partyHasChild, seatingPreference, TRAIN_STATUS_LABEL, type TrainStatus } from "./train-request";
import { parseTrainOffers, planTrainLegQuestion, trainGreeting, trainUnavailableBody, type TrainOffer } from "./train-whatsapp";
import { decodeUploadedBytes } from "./mcp-piece";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN = ["nouvelle", "recherche", "propositions", "en_attente", "prix_a_reconfirmer", "choix"];

type Row = {
  id: string;
  booking_id: string;
  customer_id: string;
  status: TrainStatus;
  depart_ville: string;
  arrivee_ville: string;
  aller_date: string;
  aller_creneau: string;
  retour_date: string | null;
  retour_creneau: string | null;
  voyageur_ids: string[];
  placement: string;
  aller: TrainOffer[];
  retour: TrainOffer[];
  step: string;
  choix_aller: number | null;
  choix_retour: number | null;
  classe: "2de" | "1re" | null;
  tarif: "non_remboursable" | "flex" | null;
  reference_sncf: string | null;
  prix_paye: number | null;
  suite: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function missing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /crm_train_requests|crm_sncf_cards/.test(error.message || "");
}

async function db() {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  return createServiceClient();
}

async function load(admin: SupabaseClient, id: string) {
  const { data, error } = await admin.from("crm_train_requests").select("*").eq("id", id).maybeSingle();
  if (missing(error)) throw new McpWriteError("La migration des demandes de train n’est pas appliquée.");
  if (error || !data) throw new McpWriteError("Demande introuvable.");
  return data as Row;
}

export async function demandesTrain(input: Record<string, unknown>) {
  const admin = await db();
  const statut = text(input.statut);
  let query = admin.from("crm_train_requests").select("id, booking_id, status, depart_ville, arrivee_ville, aller_date, retour_date, placement, updated_at").order("updated_at", { ascending: false }).limit(40);
  query = statut ? query.eq("status", statut) : query.in("status", ["nouvelle", "recherche", "prix_a_reconfirmer", "choix"]);
  const { data, error } = await query;
  if (missing(error)) return { demandes: [], message: "La migration des demandes de train n’est pas appliquée." };
  if (error) throw new McpWriteError("Lecture impossible.");
  const ids = [...new Set((data || []).map((row) => String((row as { booking_id: string }).booking_id)))];
  const refs = ids.length ? await admin.from("crm_bookings").select("id, reference").in("id", ids) : { data: [] };
  const byId = new Map(((refs.data || []) as { id: string; reference: string }[]).map((row) => [row.id, row.reference]));
  return {
    demandes: ((data || []) as Row[]).map((row) => ({
      demande_id: row.id,
      dossier_id: row.booking_id,
      reference: byId.get(row.booking_id) || null,
      statut: row.status,
      statut_libelle: TRAIN_STATUS_LABEL[row.status] || row.status,
      trajet: `${row.depart_ville} → ${row.arrivee_ville}`,
      aller: String(row.aller_date).slice(0, 10),
      retour: row.retour_date ? String(row.retour_date).slice(0, 10) : null,
      placement: row.placement,
    })),
  };
}

export async function lireDemandeTrain(input: Record<string, unknown>) {
  const id = text(input.demande_id);
  if (!UUID.test(id)) throw new McpWriteError("Demande invalide.");
  const admin = await db();
  const row = await load(admin, id);
  const [{ data: booking }, { data: customer }, { data: travelers }] = await Promise.all([
    admin.from("crm_bookings").select("id, reference").eq("id", row.booking_id).maybeSingle(),
    admin.from("crm_customers").select("id, email, phone, first_name, last_name, loyalty, birth_date").eq("id", row.customer_id).maybeSingle(),
    admin.from("crm_booking_travelers").select("id, companion_id, is_account_holder, first_name, last_name").eq("booking_id", row.booking_id),
  ]);
  const people = ((travelers || []) as { id: string; companion_id: string | null; is_account_holder: boolean; first_name: string | null; last_name: string | null }[]).filter(
    (person) => row.voyageur_ids.includes(person.id)
  );
  const companionIds = people.map((person) => person.companion_id).filter((value): value is string => Boolean(value));
  const docs = await admin
    .from("crm_travel_documents")
    .select("companion_id, doc_type, first_name, last_name, birth_date")
    .eq("customer_id", row.customer_id)
    .in("doc_type", ["passport", "passeport"]);
  const companions = companionIds.length
    ? await admin.from("crm_travel_companions").select("id, birth_date, loyalty").in("id", companionIds)
    : { data: [] };
  const [holderCards, companionCards] = await Promise.all([
    admin.from("crm_sncf_cards").select("customer_id, companion_id, card_type, card_number, valid_until").eq("customer_id", row.customer_id),
    companionIds.length
      ? admin.from("crm_sncf_cards").select("customer_id, companion_id, card_type, card_number, valid_until").in("companion_id", companionIds)
      : Promise.resolve({ data: [] as { customer_id: string | null; companion_id: string | null; card_type: string; card_number: string; valid_until: string | null }[] }),
  ]);
  const birth = new Map(((companions.data || []) as { id: string; birth_date: string | null; loyalty?: Record<string, string | null> | null }[]).map((item) => [item.id, item]));
  const documents = (docs.data || []) as { companion_id: string | null; first_name: string | null; last_name: string | null; birth_date: string | null }[];
  const sncf = [
    ...((holderCards.data || []) as { customer_id: string | null; companion_id: string | null; card_type: string; card_number: string; valid_until: string | null }[]),
    ...((companionCards.data || []) as { customer_id: string | null; companion_id: string | null; card_type: string; card_number: string; valid_until: string | null }[]),
  ];
  const day = String(row.aller_date).slice(0, 10);
  const voyageurs = people.map((person) => {
    const piece = documents.find((doc) => (person.companion_id ? doc.companion_id === person.companion_id : !doc.companion_id));
    const born = person.companion_id ? birth.get(person.companion_id)?.birth_date : (customer as { birth_date?: string | null } | null)?.birth_date;
    const age = ageOnDate(piece?.birth_date || born, day);
    const card = sncf.find((item) => (person.companion_id ? item.companion_id === person.companion_id : item.customer_id === row.customer_id && !item.companion_id));
    const loyalty = person.companion_id ? birth.get(person.companion_id)?.loyalty : (customer as { loyalty?: Record<string, string | null> | null } | null)?.loyalty;
    return {
      voyageur_id: person.id,
      prenom: piece?.first_name || person.first_name,
      nom: piece?.last_name || person.last_name,
      naissance: (piece?.birth_date || born || "").slice(0, 10) || null,
      age,
      carte_sncf: card ? { type: card.card_type, numero: card.card_number, validite: card.valid_until } : null,
      grand_voyageur: loyalty?.grand_voyageur || null,
    };
  });
  const ages = voyageurs.map((person) => person.age);
  return {
    demande_id: row.id,
    dossier_id: row.booking_id,
    reference: (booking as { reference?: string } | null)?.reference || null,
    statut: row.status,
    statut_libelle: TRAIN_STATUS_LABEL[row.status],
    itineraire: { depart: row.depart_ville, arrivee: row.arrivee_ville },
    aller: { date: day, creneau: row.aller_creneau },
    retour: row.retour_date ? { date: String(row.retour_date).slice(0, 10), creneau: row.retour_creneau } : null,
    placement: row.placement || seatingPreference({ count: voyageurs.length, child: partyHasChild(ages) }),
    voyageurs,
    client: {
      email: (customer as { email?: string | null } | null)?.email || null,
      telephone: (customer as { phone?: string | null } | null)?.phone || null,
    },
    choix: row.classe
      ? {
          aller: row.aller[row.choix_aller ?? -1] || null,
          retour: row.choix_retour == null ? null : row.retour[row.choix_retour] || null,
          classe: row.classe,
          tarif: row.tarif,
        }
      : null,
    propositions: { aller: row.aller, retour: row.retour },
    paiement: {
      outil: "creer_carte_pliant",
      trois_ds: false,
      lecture: "lire_carte_pliant",
      note: "Sans 3DS. Cette réponse ne contient aucun numéro de carte bancaire. carte_arrivee est la carte d’arrivée hôtel, pas le paiement du train.",
    },
  };
}

export async function prendreDemandeTrain(input: Record<string, unknown>) {
  const id = text(input.demande_id);
  if (!UUID.test(id)) throw new McpWriteError("Demande invalide.");
  const admin = await db();
  const row = await load(admin, id);
  const preview = { demande_id: id, statut: "recherche", statut_libelle: TRAIN_STATUS_LABEL.recherche, envoie: false as const };
  return runIfConfirmed(input, preview, async () => {
    if (row.status !== "nouvelle" && row.status !== "recherche") throw new McpWriteError("Cette demande n’est plus à prendre.");
    const { error } = await admin.from("crm_train_requests").update({ status: "recherche", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new McpWriteError("Mise à jour impossible.");
    return { ecrit: true, ...preview };
  });
}

export async function deposerPropositionsTrain(input: Record<string, unknown>) {
  const id = text(input.demande_id);
  if (!UUID.test(id)) throw new McpWriteError("Demande invalide.");
  const aller = parseTrainOffers(input.aller, "Aller", { min: 1, max: 9 });
  if ("error" in aller) throw new McpWriteError(aller.error);
  const admin = await db();
  const row = await load(admin, id);
  const retourRaw = input.retour;
  const hasReturn = Boolean(row.retour_date);
  const retour = hasReturn ? parseTrainOffers(retourRaw, "Retour", { min: 1, max: 9 }) : { offers: [] as TrainOffer[] };
  if ("error" in retour) throw new McpWriteError(retour.error);
  if (!OPEN.includes(row.status) || row.status === "choix" || row.status === "commande") {
    throw new McpWriteError("Cette demande n’attend plus de propositions.");
  }
  const { data: customer } = await admin.from("crm_customers").select("first_name, last_name, sex").eq("id", row.customer_id).maybeSingle();
  const person = customer as { first_name?: string | null; last_name?: string | null; sex?: string | null } | null;
  const plan = planTrainLegQuestion({
    greeting: trainGreeting({ sex: person?.sex, lastName: person?.last_name, firstName: person?.first_name }),
    route: `${row.depart_ville} → ${row.arrivee_ville}`,
    date: String(row.aller_date).slice(0, 10),
    leg: "aller",
    offers: aller.offers,
    sessionOpen: false,
  });
  const preview = {
    demande_id: id,
    messages: [{ partie: "aller", texte: plan.corps }],
    envoie: true as const,
    note: "Rien n’est acheté. L’accord du client viendra après la classe et le tarif.",
  };
  return runIfConfirmed(input, preview, async () => {
    const { error } = await admin
      .from("crm_train_requests")
      .update({
        aller: aller.offers,
        retour: retour.offers,
        status: "propositions",
        step: "aller",
        choix_aller: null,
        choix_retour: null,
        classe: null,
        tarif: null,
        ambigu_compte: 0,
        besoin_agence: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new McpWriteError("Enregistrement impossible.");
    return { ecrit: true, envoye: false, raison: "L’envoi WhatsApp se fait par le serveur configuré. Ici, les propositions sont enregistrées.", ...preview };
  });
}

export async function signalerTrainIndisponible(input: Record<string, unknown>) {
  const id = text(input.demande_id);
  const train = text(input.train).slice(0, 20);
  if (!UUID.test(id) || !train) throw new McpWriteError("Indiquez la demande et le train.");
  const corps = trainUnavailableBody(train);
  return runIfConfirmed(input, { demande_id: id, texte: corps, statut: "recherche", envoie: true as const }, async () => {
    const admin = await db();
    const { error } = await admin
      .from("crm_train_requests")
      .update({ status: "recherche", step: "aller", choix_aller: null, choix_retour: null, classe: null, tarif: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new McpWriteError("Mise à jour impossible.");
    return { ecrit: true, envoye: false, texte: corps };
  });
}

export async function enregistrerCommandeTrain(input: Record<string, unknown>) {
  const id = text(input.demande_id);
  const reference = text(input.reference_sncf).slice(0, 40);
  const prix = Number(input.prix);
  if (!UUID.test(id) || !reference) throw new McpWriteError("Indiquez la demande et la référence SNCF.");
  if (!Number.isFinite(prix) || prix <= 0) throw new McpWriteError("Prix payé invalide.");
  const preview = { demande_id: id, reference_sncf: reference, prix, carte: "train", visible: false, envoie: false as const };
  return runIfConfirmed(input, preview, async () => {
    const admin = await db();
    const row = await load(admin, id);
    if (row.status !== "choix") throw new McpWriteError("Le client n’a pas encore confirmé.");
    const offer = row.aller[row.choix_aller ?? -1];
    if (!offer) throw new McpWriteError("Train aller manquant.");
    const { addStaffBookingCard } = await import("./booking-item-write");
    const { attachBookingDocument } = await import("./booking-document-write");
    const bytes = input.contenu ? decodeUploadedBytes(input.contenu) : null;
    const card = await addStaffBookingCard(admin, row.booking_id, {
      kind: "rail",
      title: `${offer.depart_gare} → ${offer.arrivee_gare}`,
      supplier: "SNCF",
      confirmation_ref: reference,
      start_at: `${offer.date}T${offer.heure_depart.length === 5 ? offer.heure_depart : "08:00"}:00`,
      end_at: `${offer.date}T${offer.heure_arrivee.length === 5 ? offer.heure_arrivee : "10:00"}:00`,
      amount: prix,
      details: {
        client_hidden: true,
        train_number: offer.numero,
        classe: row.classe,
        tarif: row.tarif,
        train_request_id: row.id,
        amount_is_total: true,
        ticket_count: row.voyageur_ids.length || 1,
      },
    });
    if ("error" in card) throw new McpWriteError(card.error);
    let documentId: string | null = null;
    if (bytes) {
      const saved = await attachBookingDocument(admin, {
        bookingId: row.booking_id,
        itemId: String(card.item.id),
        kind: "billet de train",
        visibleToClient: false,
        file: { name: text(input.nom_fichier) || "billet-train.pdf", type: "application/pdf", size: bytes.length, bytes },
      });
      if ("error" in saved) throw new McpWriteError(saved.error);
      documentId = String(saved.document.id || "") || null;
    }
    await admin.from("crm_train_requests").update({ status: "commande", reference_sncf: reference, prix_paye: prix, updated_at: new Date().toISOString() }).eq("id", id);
    return { ecrit: true, carte_id: card.item.id, document_id: documentId, statut: "commande", ...preview };
  });
}

export async function annulerDemandeTrain(input: Record<string, unknown>) {
  const id = text(input.demande_id);
  if (!UUID.test(id)) throw new McpWriteError("Demande invalide.");
  return runIfConfirmed(input, { demande_id: id, statut: "annulee", envoie: false as const }, async () => {
    const admin = await db();
    const row = await load(admin, id);
    if (row.status === "commande") throw new McpWriteError("La commande est déjà passée. Une annulation de billet passe par le message du client.");
    const { error } = await admin.from("crm_train_requests").update({ status: "annulee", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new McpWriteError("Annulation impossible.");
    await notifyTrainBot({ evenement: "refus", demande_id: id, dossier_id: row.booking_id });
    return { ecrit: true, statut: "annulee" };
  });
}
