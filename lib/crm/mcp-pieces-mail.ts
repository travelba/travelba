import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import { parseTicketMail, ticketRowsFromRead, type TicketMailRead, type TicketRowDraft } from "@/lib/crm/ticket-mail";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILES = 8;
const MAX_BYTES = 8_000_000;

export type PieceRead = {
  titre: string | null;
  destination: string | null;
  debut: string | null;
  fin: string | null;
  devise: string | null;
  annulation: boolean;
  voyageurs: { prenom: string | null; nom: string | null }[];
  cartes: { type: string; titre: string; fournisseur: string | null; debut: string | null; fin: string | null }[];
  avertissements: string[];
};

export type TicketPlan = {
  dossier_id: string;
  reference: string | null;
  pnr: string | null;
  prix: number | null;
  cree: boolean;
  carte_id: string | null;
  passager: string | null;
};

type FlightRow = {
  id: string;
  confirmation_ref: string | null;
  amount: number | null;
  details: Record<string, unknown> | null;
  sort_order: number | null;
  lifecycle: string | null;
};

export type PiecesEffects = {
  read: (files: { name: string; type: string; bytes: Uint8Array }[]) => Promise<PieceRead>;
  create?: (input: Record<string, unknown>, read: PieceRead) => Promise<{ dossier_id: string; reference: string | null }>;
  complete?: (input: Record<string, unknown>, read: PieceRead) => Promise<{ dossier_id: string }>;
};

export type TicketEffects = {
  plan: (input: Record<string, unknown>) => Promise<TicketPlan>;
  apply?: (input: Record<string, unknown>, plan: TicketPlan) => Promise<TicketPlan>;
};

export type DetachView = {
  dossier_id?: string;
  statut?: string;
  status?: string;
  cartes?: number;
  pieces?: number;
  voyageurs?: number;
  supprime_dossier?: boolean;
  conserve?: string[];
  kept?: string[];
  deleted_booking?: boolean;
};

export type DetachEffects = {
  preview: (id: string) => Promise<DetachView>;
  apply?: (id: string) => Promise<DetachView>;
};

function asFiles(files: { name: string; type: string; bytes: Uint8Array }[]) {
  return files.map((file) => new File([Buffer.from(file.bytes)], file.name, { type: file.type }));
}

function flightCode(value: unknown) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function sameTicketLeg(row: FlightRow, draft: TicketRowDraft) {
  const number = flightCode(row.details?.flight_number);
  const wanted = flightCode(draft.details.flight_number);
  if (number && wanted && number === wanted) return true;
  const from = String(row.details?.from || "").toUpperCase();
  const to = String(row.details?.to || "").toUpperCase();
  return Boolean(
    from &&
      to &&
      from === String(draft.details.from || "").toUpperCase() &&
      to === String(draft.details.to || "").toUpperCase()
  );
}

function keptPassengers(current: Record<string, unknown> | null | undefined, incoming: Record<string, unknown>) {
  const existing = Array.isArray(current?.passengers) ? current.passengers : [];
  return { ...(current || {}), ...incoming, ...(existing.length ? { passengers: existing } : {}) };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function confirmed(input: Record<string, unknown>) {
  if (input.confirmer === true) return true;
  if (input.confirmer == null || input.confirmer === false) return false;
  throw new McpWriteError("confirmer est vrai ou faux.");
}

export function decodePieceFiles(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw new McpWriteError("Ajoutez au moins un PDF ou une photo.");
  if (value.length > MAX_FILES) throw new McpWriteError(`Maximum ${MAX_FILES} fichiers.`);
  return value.map((row, index) => {
    const file = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const name = text(file.nom) || `fichier-${index + 1}`;
    const type = text(file.type_mime) || "application/octet-stream";
    const raw = text(file.contenu);
    if (!raw) throw new McpWriteError(`Le fichier ${name} est vide.`);
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length || bytes.length > MAX_BYTES) throw new McpWriteError(`Le fichier ${name} est trop lourd.`);
    return { name, type, bytes: new Uint8Array(bytes) };
  });
}

export function summarizeExtract(extract: BookingExtract, warnings: string[] = []): PieceRead {
  return {
    titre: extract.title || null,
    destination: extract.destination || null,
    debut: extract.start_date || null,
    fin: extract.end_date || null,
    devise: extract.currency || null,
    annulation: isCancellationExtract(extract),
    voyageurs: (extract.travelers || []).map((person) => ({
      prenom: person.first_name || null,
      nom: person.last_name || null,
    })),
    cartes: (extract.items || []).map((item) => ({
      type: item.kind,
      titre: item.title,
      fournisseur: item.supplier || null,
      debut: item.start_at || null,
      fin: item.end_at || null,
    })),
    avertissements: warnings,
  };
}

export function planTicketDeposit(input: {
  dossier_id: string;
  reference?: string | null;
  flights: FlightRow[];
  read: TicketMailRead;
  carte_id?: string;
}): TicketPlan {
  const active = input.flights.filter((row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded");
  const pnr = input.read.pnr?.toUpperCase() || "";
  const byPnr = pnr
    ? active.find(
        (row) =>
          (row.confirmation_ref || "").toUpperCase() === pnr || String(row.details?.pnr || "").toUpperCase() === pnr
      )
    : undefined;
  const asked = input.carte_id ? active.find((row) => row.id === input.carte_id) : undefined;
  if (input.carte_id && !asked) throw new McpWriteError("Carte introuvable.");
  const current = asked || byPnr;
  if (!current && !input.read.pnr) {
    throw new McpWriteError("Le PNR n’a pas été lu. Indiquez la carte du vol.");
  }
  const passenger = input.read.passenger
    ? `${input.read.passenger.firstName} ${input.read.passenger.lastName}`.trim()
    : null;
  return {
    dossier_id: input.dossier_id,
    reference: input.reference || null,
    pnr: input.read.pnr,
    prix: input.read.price,
    cree: !current,
    carte_id: current?.id || null,
    passager: passenger,
  };
}

export async function importerPieces(input: Record<string, unknown>, effects?: PiecesEffects) {
  const files = decodePieceFiles(input.fichiers);
  const go = confirmed(input);
  if (!go || effects) {
    const read = await (effects?.read ?? liveReadPieces)(files);
    const dossierId = text(input.dossier_id);
    const clientId = text(input.client_id);
    const body = {
      envoye: false,
      ecrit: false,
      apercu: true,
      action: dossierId ? "completer" : "creer",
      ...read,
    };
    if (!go) return body;
    if (read.annulation && !dossierId) {
      throw new McpWriteError("Une annulation ne crée pas de dossier. Indiquez le séjour à compléter.");
    }
    if (dossierId) {
      if (!UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
      const done = await effects!.complete!(input, read);
      return { ...body, ...done, ecrit: true, apercu: false };
    }
    if (!clientId || !UUID.test(clientId)) throw new McpWriteError("Indiquez le client, ou le dossier à compléter.");
    const created = await effects!.create!(input, read);
    return { ...body, ...created, ecrit: true, apercu: false };
  }
  return liveWritePieces(input, files);
}

export async function deposerBillet(input: Record<string, unknown>, effects?: TicketEffects) {
  const go = confirmed(input);
  if (!go || effects) {
    const plan = await (effects?.plan ?? livePlanTicket)(input);
    const body = { envoye: false, ecrit: false, apercu: true, action: plan.cree ? "creer_carte" : "mettre_a_jour", ...plan };
    if (!go) return body;
    const applied = await effects!.apply!(input, plan);
    return { ...body, ...applied, ecrit: true, apercu: false };
  }
  const applied = await liveApplyTicket(input);
  return {
    envoye: false,
    ecrit: true,
    apercu: false,
    action: applied.cree ? "creer_carte" : "mettre_a_jour",
    ...applied,
  };
}

export async function detacherEmail(input: Record<string, unknown>, effects?: DetachEffects) {
  const id = text(input.id || input.email_id);
  if (!UUID.test(id)) throw new McpWriteError("Mail invalide.");
  const go = confirmed(input);
  if (!go || effects) {
    const preview = await (effects?.preview ?? livePreviewDetach)(id);
    const body = { envoye: false, action: "detacher", id, ...preview, ecrit: false, apercu: true };
    if (!go) return body;
    const done = await effects!.apply!(id);
    return { envoye: false, action: "detacher", id, ...done, ecrit: true, apercu: false };
  }
  const done = await liveApplyDetach(id);
  return { envoye: false, action: "detacher", id, ...(await detachView(done)), ecrit: true, apercu: false };
}

async function liveReadPieces(files: { name: string; type: string; bytes: Uint8Array }[]) {
  const { extractBookingFromPrepared } = await import("@/lib/crm/ingest-file");
  const result = await extractBookingFromPrepared(files);
  const warnings = (result.warnings || []).map((row) => row.message).filter(Boolean);
  return summarizeExtract(result.extract, warnings);
}

async function liveWritePieces(input: Record<string, unknown>, files: { name: string; type: string; bytes: Uint8Array }[]) {
  const dossierId = text(input.dossier_id);
  const clientId = text(input.client_id);
  const { extractBookingFromPrepared } = await import("@/lib/crm/ingest-file");
  const parsed = await extractBookingFromPrepared(files);
  const read = summarizeExtract(parsed.extract, (parsed.warnings || []).map((row) => row.message).filter(Boolean));
  const body = { envoye: false, action: dossierId ? "completer" : "creer", ...read };
  if (read.annulation && !dossierId) {
    throw new McpWriteError("Une annulation ne crée pas de dossier. Indiquez le séjour à compléter.");
  }
  try {
    if (dossierId) {
      if (!UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
      return { ...body, ...(await writeOntoDossier(dossierId, parsed.extract, files)), ecrit: true, apercu: false };
    }
    if (!clientId || !UUID.test(clientId)) throw new McpWriteError("Indiquez le client, ou le dossier à compléter.");
    return { ...body, ...(await writeNewDossier(clientId, parsed.extract, files)), ecrit: true, apercu: false };
  } catch (err) {
    if (err instanceof BookingIssuesError) throw new McpWriteError(err.message);
    throw err;
  }
}

async function writeNewDossier(clientId: string, extract: BookingExtract, files: { name: string; type: string; bytes: Uint8Array }[]) {
  const { persistNewBookingFromExtract } = await import("@/lib/crm/ingest-booking");
  const { refreshBookingDerived } = await import("@/lib/crm/dossier-refresh");
  const { stampBookingCreator } = await import("@/lib/crm/dossier-responsables");
  const { hotelSignatoryName } = await import("@/lib/crm/hotel-desk");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const staff = currentMcpAccess().staff;
  const booking = await persistNewBookingFromExtract({
    customerId: clientId,
    extract,
    files: asFiles(files),
    staffUserId: staff?.id,
    status: "draft",
    visibleToClient: false,
  });
  if (booking?.id) {
    await refreshBookingDerived(booking.id, { signatory: hotelSignatoryName(staff?.name) });
    if (staff?.id) {
      await stampBookingCreator(createServiceClient(), {
        bookingId: booking.id,
        staffId: staff.id,
        path: "/api/mcp",
        summary: "Dossier créé depuis des pièces.",
      });
    }
  }
  return { dossier_id: String(booking?.id || ""), reference: booking?.reference || null };
}

async function writeOntoDossier(
  dossierId: string,
  extract: BookingExtract,
  files: { name: string; type: string; bytes: Uint8Array }[]
) {
  const { applyExtractToBooking } = await import("@/lib/crm/ingest-booking");
  const { refreshBookingDerived } = await import("@/lib/crm/dossier-refresh");
  const { hotelSignatoryName } = await import("@/lib/crm/hotel-desk");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_bookings").select("id, customer_id").eq("id", dossierId).maybeSingle();
  if (error || !data) throw new McpWriteError("Dossier introuvable.");
  const staff = currentMcpAccess().staff;
  await applyExtractToBooking({
    bookingId: dossierId,
    customerId: String(data.customer_id),
    extract,
    files: asFiles(files),
    staffUserId: staff?.id,
    visibleToClient: false,
    applyStayFields: true,
  });
  await refreshBookingDerived(dossierId, { signatory: hotelSignatoryName(staff?.name) });
  return { dossier_id: dossierId };
}

export function planTicketFromText(input: {
  dossier_id: string;
  reference?: string | null;
  flights: FlightRow[];
  text: string;
  carte_id?: string;
}) {
  return planTicketDeposit({ ...input, read: parseTicketMail(input.text) });
}

async function livePlanTicket(input: Record<string, unknown>): Promise<TicketPlan> {
  const loaded = await loadTicketContext(input);
  return planTicketDeposit(loaded);
}

async function liveApplyTicket(input: Record<string, unknown>): Promise<TicketPlan> {
  const loaded = await loadTicketContext(input);
  const decided = planTicketDeposit(loaded);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { attachBookingDocument } = await import("@/lib/crm/booking-document-write");
  const admin = createServiceClient();
  const drafts = ticketRowsFromRead(loaded.read);
  const active = loaded.flights.filter((row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded");
  let carteId = decided.carte_id;
  let order =
    active.reduce((max, row) => Math.max(max, row.sort_order || 0), 0) + 1;
  for (const [index, draft] of drafts.entries()) {
    const hit =
      active.find((row) => sameTicketLeg(row, draft)) ||
      (index === 0 ? active.find((row) => row.id === decided.carte_id) : undefined);
    const details = keptPassengers(hit?.details, draft.details);
    if (hit) {
      const { error } = await admin
        .from("crm_booking_items")
        .update({
          title: draft.title,
          supplier: draft.supplier,
          confirmation_ref: draft.confirmation_ref,
          start_at: draft.start_at,
          end_at: draft.end_at,
          details,
        })
        .eq("id", hit.id)
        .eq("booking_id", loaded.dossier_id);
      if (error) throw new McpWriteError("Le vol n’a pas pu être mis à jour.");
      if (!carteId) carteId = hit.id;
      continue;
    }
    const { data, error } = await admin
      .from("crm_booking_items")
      .insert({
        booking_id: loaded.dossier_id,
        kind: "flight",
        title: draft.title,
        supplier: draft.supplier,
        confirmation_ref: draft.confirmation_ref || loaded.read.pnr,
        start_at: draft.start_at,
        end_at: draft.end_at,
        amount: null,
        sort_order: order,
        visible_to_client: false,
        details,
      })
      .select("id")
      .single();
    order += 1;
    if (error || !data?.id) throw new McpWriteError("Le vol n’a pas pu être créé.");
    if (!carteId) carteId = String(data.id);
  }
  const file = decodePieceFiles(input.fichiers ?? [input.fichier])[0];
  const attached = await attachBookingDocument(admin, {
    bookingId: loaded.dossier_id,
    itemId: carteId,
    kind: "other",
    visibleToClient: true,
    file: { name: file.name, type: file.type, size: file.bytes.byteLength, bytes: Buffer.from(file.bytes) },
  });
  if ("error" in attached) throw new McpWriteError(attached.error);
  return { ...decided, carte_id: carteId };
}

async function loadTicketContext(input: Record<string, unknown>) {
  const dossierId = text(input.dossier_id);
  const reference = text(input.reference);
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  const file = decodePieceFiles(input.fichier ? [input.fichier] : input.fichiers)[0];
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  let query = admin.from("crm_bookings").select("id, reference");
  query = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const bookings = (data || []) as { id: string; reference: string | null }[];
  if (!bookings.length) throw new McpWriteError("Dossier introuvable.");
  if (bookings.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  const booking = bookings[0];
  const flights = await admin
    .from("crm_booking_items")
    .select("id, confirmation_ref, amount, details, sort_order, lifecycle")
    .eq("booking_id", booking.id)
    .eq("kind", "flight");
  if (flights.error) throw new McpWriteError("Les vols n’ont pas pu être lus.");
  const textBody = await ticketText(file);
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    flights: (flights.data || []) as FlightRow[],
    read: parseTicketMail(textBody),
    carte_id: text(input.carte_id) || undefined,
  };
}

async function ticketText(file: { name: string; type: string; bytes: Uint8Array }) {
  const name = file.name.toLowerCase();
  if (file.type.includes("pdf") || name.endsWith(".pdf")) {
    const { pdfPlainText } = await import("@/lib/crm/pdf-raster");
    const parsed = await pdfPlainText(file.bytes);
    return parsed.text;
  }
  const raw = Buffer.from(file.bytes).toString("utf8");
  if (file.type.includes("rfc822") || name.endsWith(".eml") || raw.includes("Content-Type:")) {
    const { emlToText } = await import("@/lib/crm/ticket-mail");
    return emlToText(raw);
  }
  return raw;
}

async function detachView(row: Record<string, unknown>): Promise<DetachView> {
  return {
    dossier_id: typeof row.dossier_id === "string" ? row.dossier_id : undefined,
    statut: typeof row.statut === "string" ? row.statut : typeof row.status === "string" ? row.status : undefined,
    cartes: typeof row.cartes === "number" ? row.cartes : undefined,
    pieces: typeof row.pieces === "number" ? row.pieces : undefined,
    voyageurs: typeof row.voyageurs === "number" ? row.voyageurs : undefined,
    supprime_dossier: typeof row.supprime_dossier === "boolean" ? row.supprime_dossier : undefined,
    conserve: Array.isArray(row.conserve) ? row.conserve.map(String) : Array.isArray(row.kept) ? row.kept.map(String) : undefined,
    deleted_booking: typeof row.deleted_booking === "boolean" ? row.deleted_booking : undefined,
  };
}

async function livePreviewDetach(id: string) {
  const row = await loadIngestRow(id);
  const { detachAttachedEmail } = await import("@/lib/crm/email-detach-run");
  return detachView(await detachAttachedEmail(row, { dry: true }));
}

async function liveApplyDetach(id: string) {
  const row = await loadIngestRow(id);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { detachAttachedEmail } = await import("@/lib/crm/email-detach-run");
  const { noteIngestDecision } = await import("@/lib/crm/email-ingest");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const admin = createServiceClient();
  const result = await detachAttachedEmail(row);
  await admin.from("crm_import_proposals").update({ undone_at: new Date().toISOString() }).eq("email_ingest_id", id).is("undone_at", null);
  await noteIngestDecision(admin, {
    actorKind: "human",
    actorId: currentMcpAccess().staff?.id || null,
    action: "undo",
    emailIngestId: id,
    summary: "Application annulée",
  });
  return result;
}

async function loadIngestRow(id: string) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_email_ingest").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new McpWriteError("Mail introuvable.");
  return data;
}
