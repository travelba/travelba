import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { maskAuditText } from "@/lib/crm/audit-events";
import { maskPassportNumber } from "@/lib/crm/esta";
import { clientEmailForAutoCreate } from "@/lib/crm/email-ingest-create";
import { extractPrimaryPerson } from "@/lib/crm/email-match";
import { roundTripPairs } from "@/lib/crm/flight-roundtrip";
import { redactIngestText } from "@/lib/crm/ingest-redact";
import { isCancellationExtract, parseExtractPayloadSafe, type BookingExtract } from "@/lib/crm/ingest-types";
import { McpReadError } from "@/lib/crm/mcp-passport";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { customerEmailError, normalizeCustomerEmail } from "@/lib/crm/customer-email";
import { formatDateFr } from "@/lib/crm/money";
import { EMAIL_INBOX_QUEUE_STATUSES, type CrmEmailIngest, type EmailIngestAttachment } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_CAP = 24_000;
const PDF_CAP = 16_000;

const EMAIL_STATUS: Record<string, string> = {
  received: "reçu",
  parsed: "lu",
  matched: "proposition",
  error: "erreur",
  attached: "déposé",
  refused: "refusé",
  ignored: "ignoré",
  grouped: "regroupé",
};

const LABELED_PIECE =
  /((?:passeport|passport|n[°ºo][ \t]*(?:de[ \t]*)?(?:passeport|passport)|document[ \t]*(?:n[°o]|no\.?|number)|personal[ \t]*(?:no\.?|number)|n[°ºo][ \t]*personnel|i\.?d\.?[ \t]*no\.?)[ \t]*[:#.]?[ \t]*)([A-Z0-9]{2,}(?:[ \t-]?[A-Z0-9]{2,}){0,3})/gi;

type Admin = SupabaseClient;

export type EmailDossierDeps = {
  loadFiles?: (row: CrmEmailIngest) => Promise<File[]>;
  persist?: (opts: {
    customerId: string;
    extract: BookingExtract;
    files: File[];
    emailIngestId: string;
  }) => Promise<{ id: string; reference: string; visible_to_client?: boolean | null }>;
};

export type EmailReadDeps = {
  /** Texte brut d’un PDF, avant masquage. Absent : lecture du fichier stocké. */
  pdfText?: (attachment: EmailIngestAttachment) => Promise<string | null>;
};

function db(admin?: Admin) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function uuid(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function readUuid(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpReadError("E-mail invalide.");
  return id;
}

function fold(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function clip(text: string, cap: number) {
  if (text.length <= cap) return { texte: text, tronque: false as const };
  return { texte: text.slice(0, cap), tronque: true as const };
}

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Corps et texte de PDF : cartes masquées, MRZ et numéros de passeport
 * réduits aux trois derniers caractères. Un PNR ou un n° de vol reste lisible.
 */
export function redactEmailReadText(text: string) {
  const audited = maskAuditText(text);
  return audited
    .replace(LABELED_PIECE, (all, label: string, raw: string) => {
      const clean = raw.replace(/[\s-]/g, "");
      if (clean.length < 6 || clean.length > 14) return all;
      return `${label}${maskPassportNumber(clean)}`;
    })
    .replace(/\b\d{2}[A-Z]{2}\d{5}\b/g, (token) => maskPassportNumber(token));
}

function prose(value: unknown, cap = 2000) {
  if (typeof value !== "string") return null;
  const text = redactEmailReadText(value).trim();
  if (!text) return null;
  return text.length > cap ? text.slice(0, cap) : text;
}

function short(value: unknown) {
  if (typeof value !== "string") return null;
  const text = redactIngestText(value).trim();
  return text || null;
}

function amount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPdf(attachment: EmailIngestAttachment) {
  const mime = (attachment.mime_type || "").toLowerCase();
  return mime === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf");
}

/** Billet déjà lu, le même calcul que la file agence (prix partagé une fois, aller-retour signalé). */
export function emailTicketView(raw: unknown) {
  const extract = parseExtractPayloadSafe(raw);
  const items = extract.items || [];
  const legs = items.map((item, index) => ({
    id: String(index),
    kind: item.kind,
    title: item.title,
    supplier: item.supplier,
    confirmation_ref: item.confirmation_ref,
    start_at: item.start_at,
    details: (item.details || {}) as Record<string, unknown>,
  }));
  const pairs = roundTripPairs(legs);
  const groupOf = new Map<string, number>();
  pairs.forEach((pair, index) => {
    groupOf.set(pair.outbound.id, index + 1);
    groupOf.set(pair.inbound.id, index + 1);
  });
  return {
    titre: short(extract.title),
    destination: short(extract.destination),
    debut: short(extract.start_date),
    fin: short(extract.end_date),
    devise: short(extract.currency) || "EUR",
    statut: extract.document_status || null,
    notes: prose(extract.notes_internal) || prose(extract.notes_client),
    voyageurs: (extract.travelers || [])
      .map((row) => ({
        prenom: short(row.first_name),
        nom: short(row.last_name),
      }))
      .filter((row) => row.prenom || row.nom),
    cartes: items.map((item, index) => {
      const details = (item.details || {}) as Record<string, unknown>;
      const passengers = Array.isArray(details.passengers)
        ? details.passengers
            .map((row) => {
              const person = row as { first_name?: unknown; last_name?: unknown };
              return { prenom: short(person.first_name), nom: short(person.last_name) };
            })
            .filter((row) => row.prenom || row.nom)
        : [];
      const included = Array.isArray(details.included)
        ? details.included.map((line) => prose(line, 300)).filter((line): line is string => Boolean(line))
        : [];
      return {
        type: item.kind,
        titre: short(item.title),
        fournisseur: short(item.supplier),
        reference: short(item.confirmation_ref),
        debut: short(item.start_at),
        fin: short(item.end_at),
        pnr: short(details.pnr),
        vol: short(details.flight_number),
        de: short(details.from),
        vers: short(details.to),
        ville_depart: short(details.city_from),
        ville_arrivee: short(details.city_to),
        compagnie: short(details.airline),
        cabine: short(details.cabin),
        hotel: short(details.hotel_name),
        ville: short(details.city),
        regime: short(details.board),
        inclus: included,
        montant_lu: amount(details.document_amount),
        devise_document: short(details.document_currency),
        passagers: passengers,
        a_verifier: details.needs_review === true,
        raison: prose(details.review_reason, 300),
        aller_retour: groupOf.get(String(index)) || null,
      };
    }),
    aller_retour: pairs.map((pair, index) => ({
      groupe: index + 1,
      pnr: short(pair.outbound.confirmation_ref) || short(pair.outbound.details?.pnr),
      aller: short(pair.outbound.title),
      retour: short(pair.inbound.title),
    })),
  };
}

async function pdfTextOf(attachment: EmailIngestAttachment, deps?: EmailReadDeps) {
  if (!isPdf(attachment)) return null;
  try {
    const raw = deps?.pdfText
      ? await deps.pdfText(attachment)
      : await storedPdfText(attachment);
    if (!raw) return null;
    const clean = redactEmailReadText(raw).trim();
    return clean || null;
  } catch (err) {
    console.error("[mcp] pdf", err instanceof Error ? err.message : "error");
    return null;
  }
}

async function storedPdfText(attachment: EmailIngestAttachment) {
  const { downloadCrmFile } = await import("@/lib/crm/files");
  const { pdfPlainText } = await import("@/lib/crm/pdf-raster");
  const file = await downloadCrmFile(attachment.path);
  const extracted = await pdfPlainText(file.bytes);
  return extracted.text || "";
}

export async function readLireEmail(input: { id?: string }, admin?: Admin, deps?: EmailReadDeps) {
  const id = readUuid(input.id);
  const client = db(admin);
  const { data, error } = await client.from("crm_email_ingest").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[mcp] email", error.code ?? "?");
    throw new McpReadError("Lecture impossible.");
  }
  const row = data as CrmEmailIngest | null;
  if (!row) throw new McpReadError("E-mail introuvable.");
  const plain = (row.body_text || "").trim() || htmlToText(row.body_html || "");
  const body = clip(redactEmailReadText(plain), BODY_CAP);
  const pieces = [];
  for (const attachment of row.attachments || []) {
    const texte = await pdfTextOf(attachment, deps);
    const clipped = texte ? clip(texte, PDF_CAP) : null;
    pieces.push({
      nom: attachment.name,
      type: attachment.mime_type || (isPdf(attachment) ? "application/pdf" : null),
      texte: clipped?.texte ?? null,
      tronque: clipped?.tronque ?? false,
    });
  }
  return {
    id: row.id,
    expediteur: row.from_email,
    sujet: row.subject,
    recu_le: row.received_at ? formatDateFr(row.received_at) : null,
    statut: EMAIL_STATUS[row.status] || row.status,
    corps: body.texte,
    corps_tronque: body.tronque,
    pieces,
    billet: emailTicketView(row.extract),
    propositions: (row.candidates || []).slice(0, 5).map((candidate) => ({
      libelle: candidate.label,
      client_id: candidate.customer_id,
      dossier_id: candidate.booking_id || null,
    })),
    erreur: row.error,
  };
}

function optionalName(value: unknown, label: string) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 80) throw new McpWriteError(`${label} : 80 caractères maximum.`);
  return trimmed;
}

function explicitTravelerEmail(value: unknown, fromEmail: string | null) {
  if (value == null || String(value).trim() === "") return null;
  const email = normalizeCustomerEmail(String(value));
  const invalid = customerEmailError(email);
  if (invalid) throw new McpWriteError(invalid);
  if (!clientEmailForAutoCreate(email, fromEmail)) {
    throw new McpWriteError("Cet e-mail n’est pas celui du voyageur.");
  }
  return email;
}

async function insertCustomer(
  client: Admin,
  input: { firstName: string; lastName: string; email: string | null }
) {
  const { data, error } = await client
    .from("crm_customers")
    .insert({
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      language: "fr",
    })
    .select("id")
    .single();
  if (error?.code === "23505" && input.email) {
    const existing = await client.from("crm_customers").select("id").eq("email", input.email).maybeSingle();
    if (existing.data?.id) return { id: existing.data.id as string, created: false };
  }
  if (error || !data?.id) throw new McpWriteError("Création du compte impossible.");
  return { id: data.id as string, created: true };
}

async function resolveCustomer(
  client: Admin,
  input: Record<string, unknown>,
  extract: BookingExtract,
  fromEmail: string | null
) {
  if (input.client_id != null && String(input.client_id).trim() !== "") {
    const id = uuid(input.client_id, "Client");
    const { data, error } = await client.from("crm_customers").select("id").eq("id", id).maybeSingle();
    if (error) throw new McpWriteError("Client introuvable.");
    if (!data?.id) throw new McpWriteError("Client introuvable.");
    return { id: data.id as string, created: false };
  }
  const givenFirst = optionalName(input.prenom, "Prénom");
  const givenLast = optionalName(input.nom, "Nom");
  if ((givenFirst && !givenLast) || (!givenFirst && givenLast)) {
    throw new McpWriteError("Prénom et nom vont ensemble.");
  }
  const person =
    givenFirst && givenLast
      ? { first_name: givenFirst, last_name: givenLast }
      : extractPrimaryPerson(extract);
  const explicit = explicitTravelerEmail(input.email, fromEmail);
  const email = explicit || clientEmailForAutoCreate(extract.customer_email, fromEmail);
  if (email) {
    const { data, error } = await client.from("crm_customers").select("id").eq("email", email).maybeSingle();
    if (error) throw new McpWriteError("Client introuvable.");
    if (data?.id) return { id: data.id as string, created: false };
    if (!person?.first_name || !person.last_name) {
      throw new McpWriteError("Prénom et nom requis pour créer la fiche.");
    }
    return insertCustomer(client, { firstName: person.first_name, lastName: person.last_name, email });
  }
  if (!person?.first_name || !person.last_name) {
    throw new McpWriteError("Indiquez client_id, ou un e-mail de voyageur, ou un billet au nom du client.");
  }
  const named = await client
    .from("crm_customers")
    .select("id, first_name, last_name")
    .ilike("last_name", person.last_name.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"));
  if (named.error) throw new McpWriteError("Client introuvable.");
  const hits = ((named.data || []) as { id: string; first_name: string | null; last_name: string | null }[]).filter(
    (row) => fold(row.first_name) === fold(person.first_name) && fold(row.last_name) === fold(person.last_name)
  );
  if (hits.length > 1) throw new McpWriteError("Plusieurs fiches portent ce nom. Indiquez client_id.");
  if (hits.length === 1) return { id: hits[0].id, created: false };
  return insertCustomer(client, { firstName: person.first_name, lastName: person.last_name, email: null });
}

async function defaultFiles(row: CrmEmailIngest) {
  const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
  return loadEmailIngestFiles(row);
}

async function defaultPersist(opts: {
  customerId: string;
  extract: BookingExtract;
  files: File[];
  emailIngestId: string;
}) {
  const { persistNewBookingFromExtract } = await import("@/lib/crm/ingest-booking");
  const booking = await persistNewBookingFromExtract({
    customerId: opts.customerId,
    extract: opts.extract,
    files: opts.files,
    status: "draft",
    visibleToClient: false,
    emailIngestId: opts.emailIngestId,
  });
  return {
    id: booking.id,
    reference: booking.reference,
    visible_to_client: booking.visible_to_client,
  };
}

/**
 * Même geste que « Créer un dossier » : fiche trouvée ou créée, dossier caché,
 * cartes du billet (une ligne par trajet ; l’aller-retour au même PNR s’affiche
 * en une carte), pièces jointes. N’invite pas.
 */
export async function createDossierFromEmail(input: Record<string, unknown>, admin?: Admin, deps?: EmailDossierDeps) {
  const id = uuid(input.id, "E-mail");
  const client = db(admin);
  const { data, error } = await client.from("crm_email_ingest").select("*").eq("id", id).maybeSingle();
  if (error) throw new McpWriteError("E-mail introuvable.");
  const row = data as CrmEmailIngest | null;
  if (!row) throw new McpWriteError("E-mail introuvable.");
  if (!(EMAIL_INBOX_QUEUE_STATUSES as readonly string[]).includes(row.status)) {
    throw new McpWriteError("Cet e-mail est déjà traité.");
  }
  const extract = parseExtractPayloadSafe(row.extract);
  if (isCancellationExtract(extract)) {
    throw new McpWriteError("Une annulation ne crée pas de dossier. Rattachez-la au voyage existant.");
  }
  if (extract.document_status === "identity") {
    throw new McpWriteError("Document d’identité : enregistrez-le dans le profil, pas en réservation.");
  }
  const customer = await resolveCustomer(client, input, extract, row.from_email);
  const files = await (deps?.loadFiles ?? defaultFiles)(row);
  let booking: { id: string; reference: string; visible_to_client?: boolean | null };
  try {
    booking = await (deps?.persist ?? defaultPersist)({
      customerId: customer.id,
      extract,
      files,
      emailIngestId: row.id,
    });
  } catch (err) {
    if (err instanceof McpWriteError) throw err;
    const { BookingIssuesError } = await import("@/lib/crm/booking-issues");
    if (err instanceof BookingIssuesError) {
      const message = err.issues.map((issue) => issue.message).filter(Boolean).join(" ");
      throw new McpWriteError(message || err.message);
    }
    console.error("[mcp] dossier", err instanceof Error ? err.message : "error");
    throw new McpWriteError("Création du dossier impossible.");
  }
  if (booking.visible_to_client) {
    await client.from("crm_bookings").update({ visible_to_client: false }).eq("id", booking.id);
  }
  const { error: updateError } = await client
    .from("crm_email_ingest")
    .update({ status: "attached", created_booking_id: booking.id })
    .eq("id", row.id);
  if (updateError) throw new McpWriteError("E-mail non classé.");
  const { closeIngestSiblings, noteIngestDecision } = await import("@/lib/crm/email-ingest");
  await closeIngestSiblings(client, row, "attached", null);
  await noteIngestDecision(client, {
    actorKind: "human",
    actorId: null,
    action: "new_booking",
    emailIngestId: row.id,
    bookingId: booking.id,
    customerId: customer.id,
    summary: "Dossier créé depuis le mail",
  });
  return {
    id: row.id,
    statut: "attached" as const,
    dossier_id: booking.id,
    reference: booking.reference,
    visible: false as const,
    client_id: customer.id,
    client_cree: customer.created,
    invitation: false as const,
    cartes: true as const,
  };
}
