import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { BookingIssuesError, issuesSummary } from "@/lib/crm/booking-issues";
import { openStayForVisa } from "@/lib/crm/bookings";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpReadError } from "@/lib/crm/mcp-passport";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { travelerDisplayName } from "@/lib/crm/trip-documents";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { openAcceptedVisa } from "@/lib/crm/visa-accept";
import {
  clientVisaStepLabel,
  decideVisaLaunch,
  estaAnswersFrom,
  frenchPassportCount,
  parseVisaCorridor,
  readEstaAnswers,
  visaJourneyLines,
  visaLaunchSummary,
  type ClientVisaStep,
  type EstaAnswers,
  type VisaLaunchPreview,
} from "@/lib/crm/visa-flow";
import type { VisaCorridor } from "@/lib/crm/visa-fees";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class VisaLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisaLaunchError";
  }
}

type PriorRequest = {
  step?: ClientVisaStep | null;
  status?: string | null;
  answers?: unknown;
  accepted_at?: string | null;
  traveler_ids?: string[] | null;
  launched_by_name?: string | null;
};

function asCorridor(value: string): value is VisaCorridor {
  return value === "IL" || value === "US" || value === "GB";
}

function readableFailure(err: unknown) {
  if (err instanceof VisaLaunchError || err instanceof McpWriteError) return err.message;
  if (err instanceof BookingIssuesError) return issuesSummary(err.issues) || err.message;
  if (err instanceof Error && err.message) return err.message;
  return "La demande n’a pas pu être lancée.";
}

export async function launchVisaForAgency(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    country: VisaCorridor;
    travelerIds: string[] | null;
    answers: Partial<EstaAnswers>;
    confirm: boolean;
    author: { staffId: string | null; name: string };
    path: string;
  }
) {
  const { data: booking, error: bookingError } = await supabase.from("crm_bookings").select("*").eq("id", input.bookingId).maybeSingle();
  if (bookingError) return { ok: false as const, error: "Dossier illisible." };
  if (!booking) throw new VisaLaunchError("Réservation introuvable");
  const b = booking as CrmBooking;
  if (b.archived_at) return { ok: false as const, error: "Ce dossier est archivé." };

  const [{ data: travelers }, { data: documents }, { data: prior }, { data: items }, { data: customer }, { data: companions }] =
    await Promise.all([
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
      supabase.from("crm_travel_documents").select("doc_type, issuing_country, number").eq("customer_id", b.customer_id),
      supabase
        .from("crm_visa_requests")
        .select("step, status, answers, accepted_at")
        .eq("booking_id", b.id)
        .eq("country", input.country)
        .maybeSingle(),
      supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
      supabase.from("crm_customers").select("*").eq("id", b.customer_id).maybeSingle(),
      supabase.from("crm_travel_companions").select("*").eq("customer_id", b.customer_id),
    ]);
  if (!customer) return { ok: false as const, error: "Client introuvable." };

  const party = (travelers || []) as CrmBookingTraveler[];
  const trip = frenchPassportTrip((items || []) as CrmBookingItem[], party.length);
  if (!trip.entries.some((entry) => entry.iso === input.country)) {
    return { ok: false as const, error: "Ce pays n’est pas une formalité détectée sur les vols du dossier." };
  }
  const priorRow = prior as PriorRequest | null;
  const stored = readEstaAnswers(priorRow?.answers);
  const answers = {
    usAddress: input.answers.usAddress?.trim() || stored.usAddress || "",
    employment: input.answers.employment?.trim() || stored.employment || "",
    countriesVisited: input.answers.countriesVisited?.trim() || stored.countriesVisited || "",
    priorRefusal: input.answers.priorRefusal?.trim() || stored.priorRefusal || "",
  };
  const decision = decideVisaLaunch({
    confirm: input.confirm,
    country: input.country,
    requestedTravelerIds: input.travelerIds,
    party: party.map((row) => ({ id: row.id, nom: travelerDisplayName(row) })),
    alreadyAccepted: Boolean(priorRow?.accepted_at),
    frenchPassports: frenchPassportCount(documents as Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[]),
    answers,
    offerVisa: b.offer_visa === true,
    priorStep: priorRow?.step || null,
    priorStatus: priorRow?.status || null,
    passengers: trip.passengers,
  });
  if (decision.kind === "refuse") return { ok: false as const, error: decision.error };
  if (decision.kind === "preview") return { ok: true as const, launched: false as const, preview: decision.preview };

  try {
    const stay = await openStayForVisa(supabase, b);
    if (decision.enableOffer) {
      const { error } = await supabase.from("crm_bookings").update({ offer_visa: true }).eq("id", b.id);
      if (error) throw new VisaLaunchError("Le visa n’a pas pu être proposé sur le dossier.");
      stay.booking.offer_visa = true;
    }
    const authorName = input.author.name.trim() || "l’agence";
    await openAcceptedVisa(supabase, {
      booking: stay.booking,
      country: input.country,
      step: decision.step,
      status: decision.status,
      travelerIds: decision.travelerIds,
      travelers: party,
      items: (items || []) as CrmBookingItem[],
      holder: customer as CrmCustomer,
      companions: (companions || []) as CrmCompanion[],
      answers,
      enforceWindow: false,
      launchedBy: { staffId: input.author.staffId, name: authorName },
    });
    await recordAgencyJournal({
      staffId: input.author.staffId,
      action: "create",
      entityType: "dossier",
      entityId: b.id,
      summary: visaLaunchSummary(input.country, authorName),
      path: input.path,
    });
    const preview: VisaLaunchPreview = { ...decision.preview, offre_visa: true };
    return {
      ok: true as const,
      launched: true as const,
      country: input.country,
      step: decision.step,
      fillIsrael: decision.fillIsrael,
      author: authorName,
      preview,
    };
  } catch (err) {
    return { ok: false as const, error: readableFailure(err) };
  }
}

export async function readVisaJourney(
  supabase: SupabaseClient,
  input: { dossierId?: string; reference?: string }
) {
  const dossierId = (input.dossierId || "").trim();
  const reference = (input.reference || "").trim();
  if (!dossierId && !reference) return { message: "Indiquez le dossier." };
  if (dossierId && !UUID.test(dossierId)) return { message: "Dossier invalide." };
  let query = supabase.from("crm_bookings").select("id, reference, offer_visa, archived_at").limit(2);
  query = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
  const { data, error } = await query;
  if (error) throw new VisaLaunchError("Dossier illisible.");
  const rows = (data || []) as { id: string; reference: string; offer_visa?: boolean | null }[];
  if (rows.length !== 1) return { introuvable: true as const };
  const booking = rows[0];
  const [{ data: requests }, { data: travelers }, { data: items }] = await Promise.all([
    supabase
      .from("crm_visa_requests")
      .select("country, step, status, accepted_at, traveler_ids, launched_by_name")
      .eq("booking_id", booking.id),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", booking.id),
    supabase.from("crm_booking_items").select("kind, details, lifecycle").eq("booking_id", booking.id),
  ]);
  const party = ((travelers || []) as CrmBookingTraveler[]).map((row) => ({
    id: row.id,
    nom: travelerDisplayName(row),
  }));
  const trip = frenchPassportTrip((items || []) as CrmBookingItem[], party.length);
  const detected = trip.entries.map((entry) => entry.iso).filter(asCorridor);
  return {
    reference: booking.reference,
    offre_visa: booking.offer_visa === true,
    parcours: visaJourneyLines({
      travelers: party,
      requests: (requests || []) as (PriorRequest & { country: string })[],
      detected,
    }),
  };
}

export function corridorFromTool(value: unknown) {
  return parseVisaCorridor(value);
}

function toolText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toolTravelers(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
}

function launchAuthor() {
  const access = currentMcpAccess();
  const staffName = access.staff?.name?.trim();
  if (staffName) return { staffId: access.staff?.id ?? null, name: staffName };
  const actor = access.actor?.trim();
  if (actor && actor !== "mcp") return { staffId: null, name: actor };
  return { staffId: null, name: "l’agence" };
}

/** Lance la formalité, ou renvoie le prix si confirmer n’est pas vrai. */
export async function lancerFormalite(args: Record<string, unknown>) {
  const country = parseVisaCorridor(args.pays ?? args.country);
  if (!country) throw new McpWriteError("Indiquez le pays : Israël, États-Unis ou Royaume-Uni.");
  const dossierId = toolText(args.dossier_id);
  const reference = toolText(args.reference);
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  const admin = createServiceClient();
  let query = admin.from("crm_bookings").select("id").limit(2);
  query = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
  const { data, error } = await query;
  if (error) throw new McpWriteError("Dossier illisible.");
  const rows = (data || []) as { id: string }[];
  if (rows.length !== 1) throw new McpWriteError("Dossier introuvable.");
  let result: Awaited<ReturnType<typeof launchVisaForAgency>>;
  try {
    result = await launchVisaForAgency(admin, {
      bookingId: rows[0].id,
      country,
      travelerIds: toolTravelers(args.voyageurs),
      answers: estaAnswersFrom(args.reponses),
      confirm: args.confirmer === true,
      author: launchAuthor(),
      path: "/api/mcp",
    });
  } catch (err) {
    if (err instanceof VisaLaunchError) throw new McpWriteError(err.message);
    throw err;
  }
  if (!result.ok) throw new McpWriteError(result.error);
  if (!result.launched) return result.preview;
  return {
    lance: true,
    pays: result.preview.pays,
    code: result.country,
    formalite: result.preview.formalite,
    etape: clientVisaStepLabel(result.step),
    lance_par: result.author,
    offre_visa: true,
    prix_eur: result.preview.prix_eur,
    par_passager_eur: result.preview.par_passager_eur,
    frais_etat: result.preview.frais_etat,
    message: "La demande est lancée. Le client voit le suivi dans son espace.",
    suite: "Le remplissage du portail et le paiement restent à l’écran.",
  };
}

export async function statutFormalite(args: Record<string, unknown>) {
  try {
    return await readVisaJourney(createServiceClient(), {
      dossierId: toolText(args.dossier_id),
      reference: toolText(args.reference),
    });
  } catch (err) {
    if (err instanceof VisaLaunchError) throw new McpReadError(err.message);
    throw err;
  }
}
