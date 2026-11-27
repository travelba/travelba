import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { notifyTrainBot } from "@/lib/crm/train-bot";
import { ageOnDate, partyHasChild, seatingPreference, TRAIN_DEFAULT_OUTBOUND, TRAIN_DEFAULT_RETURN, TRAIN_STATUS_LABEL } from "@/lib/crm/train-request";
import { trainProgress, type TrainProgressInput } from "@/lib/crm/train-progress";
import type { TrainOffer } from "@/lib/crm/train-whatsapp";
import { insertionPlan, serviceKindOf, serviceRequestCard, type ServiceSide } from "@/lib/crm/service-request";

type Ctx = { params: Promise<{ id: string }> };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const demande = new URL(request.url).searchParams.get("demande") || "";
  if (!UUID.test(demande)) return jsonError("Demande invalide.");
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_train_requests")
    .select("status, step, created_at, updated_at, aller, retour, choix_aller, choix_retour, classe, tarif, reference_sncf, prix_paye, billets_envoyes, retour_date, depart_ville, arrivee_ville, customer_id")
    .eq("id", demande)
    .eq("booking_id", id)
    .maybeSingle();
  if (error?.code === "42P01") return jsonError("La migration des demandes de train n’est pas appliquée.");
  if (error || !data) return jsonError("Demande introuvable.", 404);
  const row = data as {
    status: string;
    step: string;
    created_at: string;
    updated_at: string;
    aller: TrainOffer[] | null;
    retour: TrainOffer[] | null;
    choix_aller: number | null;
    choix_retour: number | null;
    classe: string | null;
    tarif: string | null;
    reference_sncf: string | null;
    prix_paye: number | null;
    billets_envoyes: string[] | null;
    retour_date: string | null;
    depart_ville: string | null;
    arrivee_ville: string | null;
    customer_id: string | null;
  };
  const person = row.customer_id
    ? await admin.from("crm_customers").select("first_name").eq("id", row.customer_id).maybeSingle()
    : { data: null };
  const prenom = (person.data as { first_name?: string | null } | null)?.first_name || null;
  const input: TrainProgressInput = {
    status: row.status,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aller: row.aller || [],
    retour: row.retour || [],
    choixAller: row.choix_aller,
    choixRetour: row.choix_retour,
    classe: row.classe,
    tarif: row.tarif,
    reference: row.reference_sncf,
    prix: row.prix_paye == null ? null : Number(row.prix_paye),
    billets: row.billets_envoyes || [],
    retourDate: row.retour_date,
    depart: row.depart_ville,
    arrivee: row.arrivee_ville,
    prenom,
  };
  return NextResponse.json({ suivi: trainProgress(input) });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Requête illisible.");
  const depart = typeof body.depart === "string" ? body.depart.trim() : "";
  const arrivee = typeof body.arrivee === "string" ? body.arrivee.trim() : "";
  const allerDate = typeof body.aller_date === "string" ? body.aller_date : "";
  const retourDate = typeof body.retour_date === "string" ? body.retour_date : "";
  const simple = body.aller_simple === true;
  const ids = Array.isArray(body.voyageur_ids) ? body.voyageur_ids.filter((value): value is string => typeof value === "string") : [];
  if (!depart || !arrivee) return jsonError("Indiquez la ville de départ et la ville d’arrivée.");
  if (!DAY.test(allerDate)) return jsonError("Date d’aller invalide.");
  if (!simple && !DAY.test(retourDate)) return jsonError("Date de retour invalide.");
  if (!ids.length) return jsonError("Choisissez au moins un voyageur.");
  const admin = createServiceClient();
  const { data: booking, error: bookingError } = await admin
    .from("crm_bookings")
    .select("id, customer_id, reference, status, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (bookingError || !booking || booking.archived_at || booking.status === "cancelled") return jsonError("Dossier introuvable.");
  const { data: travelers } = await admin.from("crm_booking_travelers").select("id, companion_id").eq("booking_id", id);
  const known = new Set(((travelers || []) as { id: string }[]).map((traveler) => traveler.id));
  if (ids.some((travelerId) => !known.has(travelerId))) return jsonError("Voyageur hors de ce dossier.");
  const open = await admin
    .from("crm_train_requests")
    .select("id")
    .eq("booking_id", id)
    .in("status", ["nouvelle", "recherche", "propositions", "en_attente", "prix_a_reconfirmer", "choix"])
    .limit(1);
  if (open.error?.code === "42P01") return jsonError("La migration des demandes de train n’est pas appliquée.");
  if ((open.data || []).length) return jsonError("Une demande de train est déjà en cours sur ce dossier.");
  const people = ((travelers || []) as { id: string; companion_id: string | null }[]).filter((traveler) => ids.includes(traveler.id));
  const companionIds = people.map((person) => person.companion_id).filter((value): value is string => Boolean(value));
  const companions = companionIds.length
    ? await admin.from("crm_travel_companions").select("id, birth_date").in("id", companionIds)
    : { data: [] };
  const holder = await admin.from("crm_customers").select("birth_date").eq("id", booking.customer_id).maybeSingle();
  const births = new Map(((companions.data || []) as { id: string; birth_date: string | null }[]).map((row) => [row.id, row.birth_date]));
  const ages = people.map((person) =>
    ageOnDate(person.companion_id ? births.get(person.companion_id) : (holder.data as { birth_date?: string | null } | null)?.birth_date, allerDate)
  );
  const placement = seatingPreference({ count: ids.length, child: partyHasChild(ages) });
  const kind = serviceKindOf(body.kind);
  const anchorId = typeof body.anchor_item_id === "string" ? body.anchor_item_id : "";
  const anchorSide: ServiceSide | "" = body.anchor_side === "avant" || body.anchor_side === "apres" ? body.anchor_side : "";
  let sortOrder: number | null = null;
  if (anchorId && anchorSide) {
    const existing = await admin.from("crm_booking_items").select("id, sort_order").eq("booking_id", id);
    if (existing.error) return jsonError("Lecture des cartes impossible.");
    const plan = insertionPlan((existing.data || []) as { id: string; sort_order: number | null }[], anchorId, anchorSide);
    if ("error" in plan) return jsonError(plan.error || "Carte introuvable.");
    sortOrder = plan.sortOrder;
    for (const shift of plan.shifts) {
      const moved = await admin.from("crm_booking_items").update({ sort_order: shift.sort_order }).eq("id", shift.id).eq("booking_id", id);
      if (moved.error) return jsonError("Le rang des cartes n’a pas pu être décalé.");
    }
  }
  const inserted = await admin
    .from("crm_train_requests")
    .insert({
      booking_id: id,
      customer_id: booking.customer_id,
      kind,
      status: "nouvelle",
      depart_ville: depart,
      arrivee_ville: arrivee,
      aller_date: allerDate,
      aller_creneau: typeof body.aller_creneau === "string" && body.aller_creneau.trim() ? body.aller_creneau.trim() : TRAIN_DEFAULT_OUTBOUND,
      retour_date: simple ? null : retourDate,
      retour_creneau: simple ? null : typeof body.retour_creneau === "string" && body.retour_creneau.trim() ? body.retour_creneau.trim() : TRAIN_DEFAULT_RETURN,
      voyageur_ids: ids,
      placement,
      ...(anchorId && anchorSide ? { anchor_item_id: anchorId, anchor_side: anchorSide } : {}),
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) return jsonError("Enregistrement impossible.");
  const { addStaffBookingCard } = await import("@/lib/crm/booking-item-write");
  const cardBody = serviceRequestCard({
    kind,
    depart,
    arrivee,
    allerDate,
    sortOrder,
    requestId: inserted.data.id,
  });
  const card = await addStaffBookingCard(admin, id, cardBody);
  if (!("error" in card)) {
    await admin.from("crm_train_requests").update({ item_id: card.item.id }).eq("id", inserted.data.id);
  }
  const bot = await notifyTrainBot({
    evenement: "demande_creee",
    demande_id: inserted.data.id,
    dossier_id: id,
    reference: booking.reference,
  });
  return NextResponse.json({
    demande_id: inserted.data.id,
    statut: "nouvelle",
    statut_libelle: TRAIN_STATUS_LABEL.nouvelle,
    placement,
    bot,
  });
}
