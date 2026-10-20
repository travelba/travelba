import "server-only";

import WebSocket from "ws";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseMoneyToCents, principalGuest } from "./hotel-arrival";
import { bookingCardValidity, manualStayCardBody, sameCardNameCount } from "./manual-stay-card";
import { currentMcpAccess } from "./mcp-auth";
import { McpReadError, journalReference } from "./mcp-passport";
import { McpWriteError } from "./mcp-write";
import { pliantDesignation } from "./eta-il-fee";
import { hotelDisplayName } from "./carnet";
import { rememberPliantCard } from "./pliant-card-run";
import { issuePliantCard, lockPliantCard, pliantConfigured, readPliantCardFace, readPliantCardSecrets, unlockPliantCard } from "./pliant";
import { isActiveItem, type CrmBookingItem } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MAJOR = 100_000;
const MAX_TRANSACTIONS = 20;

type CardKind = "creation" | "reveal" | "blocage" | "deblocage";
type CardOutcome = "ok" | "refuse" | "introuvable" | "invalide" | "choix" | "erreur";

type BookingHit = {
  id: string;
  reference: string | null;
  title: string | null;
  customer_id: string | null;
  end_date: string | null;
};

type CardRow = {
  id: string;
  pliant_card_id: string;
  label: string | null;
  first_name: string | null;
  last_name: string | null;
  limit_cents: number | null;
  transaction_limit_cents: number | null;
  max_transaction_count: number | null;
  currency: string | null;
  status: string | null;
  last4: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
};

export type CardSecrets = { pan: string; expiry: string; cvc: string };

export type CardDeps = {
  configured: () => boolean;
  issue: (body: unknown) => Promise<{ cardId: string | null }>;
  face: (cardId: string) => Promise<{ last4: string | null }>;
  secrets: (cardId: string) => Promise<CardSecrets>;
  lock: (cardId: string) => Promise<void>;
  unlock: (cardId: string) => Promise<void>;
};

function openDb() {
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

const defaultDeps: CardDeps = {
  configured: pliantConfigured,
  issue: (body) => issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", body),
  face: (cardId) => readPliantCardFace(cardId),
  secrets: (cardId) => readPliantCardSecrets(cardId),
  lock: (cardId) => lockPliantCard(cardId),
  unlock: (cardId) => unlockPliantCard(cardId),
};

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Message renvoyé au modèle. Un numéro éventuel est retiré, et n’est pas journalisé. */
function publicFailure(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : "";
  const safe = raw
    .replace(/\b\d{13,19}\b/g, "")
    .replace(/\b(?:\d{4} ){3}\d{4,7}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe || safe.length > 180) return fallback;
  return safe;
}

function major(value: unknown) {
  if (value == null || value === "") return null;
  return parseMoneyToCents(typeof value === "number" ? value : clean(value));
}

function currencyOf(value: unknown) {
  const raw = clean(value);
  if (!raw) return "EUR";
  const code = raw.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function transactionCount(value: unknown) {
  if (value == null || value === "") return 1;
  const raw = typeof value === "number" ? String(value) : clean(value);
  if (!/^\d+$/.test(raw)) return null;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > MAX_TRANSACTIONS) return null;
  return count;
}

function sameId(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function majorFromCents(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return null;
  return cents / 100;
}

function holder(first: string | null | undefined, last: string | null | undefined) {
  return [clean(first), clean(last)].filter(Boolean).join(" ") || null;
}

/** Le libellé journalisé ne peut pas porter un numéro de carte. */
function auditLabel(value: string | null | undefined) {
  const text = clean(value).replace(/\b\d{13,19}\b/g, "").replace(/\b(?:\d{4} ){3}\d{4,7}\b/g, "").trim();
  return text.slice(0, 40) || null;
}

function dossierQuery(input: { dossier_id?: string; reference?: string }) {
  const dossierId = clean(input.dossier_id);
  const reference = clean(input.reference);
  if (!dossierId && !reference) return { kind: "missing" as const };
  if (dossierId && !UUID.test(dossierId)) return { kind: "invalid" as const };
  if (reference.length > 80) return { kind: "invalid" as const };
  return { kind: "dossier" as const, dossierId: dossierId || null, reference: reference || null };
}

async function writeCardAudit(
  admin: Admin,
  row: {
    actor: string;
    customerId?: string | null;
    bookingId?: string | null;
    reference?: string | null;
    pliantCardId?: string | null;
    label?: string | null;
    limitCents?: number | null;
    currency?: string | null;
    kind: CardKind;
    outcome: CardOutcome;
  }
) {
  const pliantCardId = clean(row.pliantCardId);
  const { error } = await admin.from("crm_mcp_card_events").insert({
    actor: row.actor.slice(0, 40),
    customer_id: row.customerId || null,
    booking_id: row.bookingId && UUID.test(row.bookingId) ? row.bookingId : null,
    reference: journalReference(row.reference),
    pliant_card_id: pliantCardId && pliantCardId.length <= 80 && !/\d{12,}/.test(pliantCardId) ? pliantCardId : null,
    label: auditLabel(row.label),
    limit_cents: row.limitCents && row.limitCents > 0 ? Math.round(row.limitCents) : null,
    currency: row.currency && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null,
    kind: row.kind,
    outcome: row.outcome,
  });
  if (!error) return true;
  console.error("[mcp] carte journal", error.code ?? "?");
  return false;
}

async function loadBooking(admin: Admin, query: { dossierId: string | null; reference: string | null }) {
  let request = admin.from("crm_bookings").select("id, reference, title, customer_id, end_date");
  request = query.dossierId ? request.eq("id", query.dossierId) : request.eq("reference", query.reference || "");
  const { data, error } = await request.limit(2);
  if (error) {
    console.error("[mcp] carte dossier", error.code ?? "?");
    return { error: true as const, rows: [] as BookingHit[] };
  }
  return { error: false as const, rows: (data || []) as BookingHit[] };
}

async function holderForBooking(admin: Admin, booking: BookingHit, prenom: string, nom: string) {
  if (prenom || nom) {
    if (!prenom || !nom) return { error: "Indiquez le prénom et le nom du titulaire." as const };
    return { firstName: prenom, lastName: nom };
  }
  const [{ data: travelers }, customer] = await Promise.all([
    admin
      .from("crm_booking_travelers")
      .select("first_name, last_name, is_account_holder")
      .eq("booking_id", booking.id),
    booking.customer_id
      ? admin.from("crm_customers").select("first_name, last_name").eq("id", booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const guest = principalGuest({
    travelers: ((travelers || []) as { first_name: string | null; last_name: string | null; is_account_holder: boolean }[]),
    holder: (customer.data as { first_name: string; last_name: string } | null) || null,
  });
  if (!guest.firstName || !guest.lastName) return { error: "Indiquez le prénom et le nom du titulaire." as const };
  return guest;
}

function publicCard(row: CardRow) {
  return {
    carte_id: row.id,
    nom: row.label || "Carte",
    titulaire: holder(row.first_name, row.last_name),
    plafond: majorFromCents(row.limit_cents),
    devise: row.currency || "EUR",
    transactions: row.max_transaction_count,
    quatre_derniers: row.last4 && /^\d{4}$/.test(row.last4) ? row.last4 : null,
    statut: row.status === "locked" ? "bloquée" : row.status === "terminated" ? "supprimée" : "active",
  };
}

async function dossierCardContext(admin: Admin, booking: BookingHit, holderLast: string) {
  const [{ data: customer }, { data: items }] = await Promise.all([
    booking.customer_id
      ? admin.from("crm_customers").select("last_name").eq("id", booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null as { last_name?: string | null } | null }),
    admin.from("crm_booking_items").select("kind, title, supplier, details, lifecycle").eq("booking_id", booking.id),
  ]);
  const account = clean((customer as { last_name?: string | null } | null)?.last_name);
  const hotels = ((items || []) as Pick<CrmBookingItem, "kind" | "title" | "supplier" | "details" | "lifecycle">[])
    .filter((item) => item.kind === "hotel" && isActiveItem(item))
    .map((item) => hotelDisplayName(item as CrmBookingItem));
  return {
    client: account || holderLast,
    hotels,
    reference: booking.reference,
  };
}

export async function createPliantCard(
  input: {
    dossier_id?: string;
    reference?: string;
    nom?: string;
    plafond?: unknown;
    devise?: string;
    transactions?: unknown;
    montant_transaction?: unknown;
    prenom?: string;
    nom_titulaire?: string;
  },
  admin: Admin = openDb(),
  deps: CardDeps = defaultDeps
) {
  const access = currentMcpAccess();
  const query = dossierQuery(input);
  const label = pliantDesignation(input.nom);
  const limitCents = major(input.plafond);
  const currency = currencyOf(input.devise);
  const count = transactionCount(input.transactions);
  const perTx = input.montant_transaction == null || input.montant_transaction === "" ? limitCents : major(input.montant_transaction);
  const auditBase = {
    actor: access.actor,
    bookingId: query.kind === "dossier" ? query.dossierId : null,
    reference: query.kind === "dossier" ? query.reference : null,
    label,
    limitCents,
    currency: currency || null,
    kind: "creation" as const,
  };

  if (access.cards !== true) {
    await writeCardAudit(admin, { ...auditBase, outcome: "refuse" });
    throw new McpWriteError("Cet assistant n’est pas autorisé à créer une carte.");
  }
  if (query.kind === "missing") {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Indiquez un identifiant de dossier ou une référence." };
  }
  if (query.kind === "invalid" || !label || !currency || count == null) {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    if (!label) return { message: "Indiquez le nom de la carte." };
    if (!currency) return { message: "Devise inconnue." };
    if (count == null) return { message: `Le nombre de transactions va de 1 à ${MAX_TRANSACTIONS}.` };
    return { message: "Identifiant inconnu." };
  }
  if (limitCents == null) {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Indiquez le plafond." };
  }
  if (limitCents > MAX_MAJOR * 100) {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Le plafond dépasse 100 000." };
  }
  if (perTx == null || perTx > limitCents) {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return {
      message: perTx == null ? "Indiquez le montant par transaction." : "Le montant par transaction ne peut pas dépasser le plafond.",
    };
  }

  const loaded = await loadBooking(admin, query);
  if (loaded.error) {
    await writeCardAudit(admin, { ...auditBase, outcome: "erreur" });
    throw new McpWriteError("Écriture impossible.");
  }
  if (!loaded.rows.length) {
    await writeCardAudit(admin, { ...auditBase, outcome: "introuvable" });
    return { introuvable: true as const };
  }
  if (loaded.rows.length > 1) {
    await writeCardAudit(admin, { ...auditBase, outcome: "choix" });
    return {
      message: "Plusieurs dossiers correspondent. Précisez l’identifiant.",
      choix: loaded.rows.map((row) => ({ id: row.id, reference: row.reference, titre: row.title })),
    };
  }

  const booking = loaded.rows[0];
  const named = await holderForBooking(admin, booking, clean(input.prenom), clean(input.nom_titulaire));
  if ("error" in named) {
    await writeCardAudit(admin, {
      ...auditBase,
      outcome: "invalide",
      customerId: booking.customer_id,
      bookingId: booking.id,
      reference: booking.reference,
    });
    return { message: named.error };
  }

  const { data: priorData } = await admin
    .from("crm_booking_cards")
    .select("first_name, last_name")
    .eq("booking_id", booking.id);
  const prior = (priorData || []) as { first_name: string | null; last_name: string | null }[];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
  const window = bookingCardValidity(today, booking.end_date);
  const context = await dossierCardContext(admin, booking, named.lastName);
  const body = manualStayCardBody({
    firstName: named.firstName,
    lastName: named.lastName,
    limitCents,
    validFrom: window.validFrom,
    validTo: window.validTo,
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    existingCards: sameCardNameCount(
      prior.map((row) => ({ firstName: row.first_name || "", lastName: row.last_name || "" })),
      named.firstName,
      named.lastName
    ),
    designation: label,
    client: context.client,
    hotels: context.hotels,
    reference: context.reference,
    transactionLimitCents: perTx,
    maxTransactionCount: count,
    currency,
  });

  if (!deps.configured()) {
    await writeCardAudit(admin, {
      ...auditBase,
      outcome: "erreur",
      customerId: booking.customer_id,
      bookingId: booking.id,
      reference: booking.reference,
    });
    throw new McpWriteError("Pliant n’est pas branché.");
  }

  let cardId = "";
  try {
    const issued = await deps.issue(body);
    cardId = issued.cardId || "";
    if (!cardId) throw new Error("Pliant n’a pas créé la carte.");
  } catch (err) {
    console.error("[mcp] carte", "émission");
    await writeCardAudit(admin, {
      ...auditBase,
      outcome: "erreur",
      customerId: booking.customer_id,
      bookingId: booking.id,
      reference: booking.reference,
      pliantCardId: cardId || null,
    });
    throw new McpWriteError(publicFailure(err, "Pliant n’a pas créé la carte."));
  }

  let last4: string | null = null;
  try {
    const face = await deps.face(cardId);
    last4 = face.last4 && /^\d{4}$/.test(face.last4) ? face.last4 : null;
  } catch {
    last4 = null;
  }

  const carteId = crypto.randomUUID();
  const { error } = await admin.from("crm_booking_cards").insert({
    id: carteId,
    booking_id: booking.id,
    pliant_card_id: cardId,
    label: body.label,
    first_name: named.firstName,
    last_name: named.lastName,
    limit_cents: body.limit.value,
    transaction_limit_cents: body.transactionLimit.value,
    max_transaction_count: body.maxTransactionCount,
    currency: body.limit.currency,
    valid_from: body.validFrom,
    valid_to: body.validTo,
    last4,
    status: "active",
  });
  if (error) {
    console.error("[mcp] carte dossier", error.code ?? "?");
    await writeCardAudit(admin, {
      ...auditBase,
      outcome: "erreur",
      customerId: booking.customer_id,
      bookingId: booking.id,
      reference: booking.reference,
      pliantCardId: cardId,
      limitCents: body.limit.value,
      currency: body.limit.currency,
    });
    throw new McpWriteError("La carte a été créée, mais le dossier ne l’a pas enregistrée.");
  }

  await rememberPliantCard(admin, {
    pliant_card_id: cardId,
    customer_id: booking.customer_id,
    booking_id: booking.id,
    label: body.label,
    last4,
    limit_cents: body.limit.value,
    currency: body.limit.currency,
    status: "active",
    limit_manual: true,
    transaction_limit_cents: body.transactionLimit.value,
    max_transaction_count: body.maxTransactionCount,
  });

  await writeCardAudit(admin, {
    actor: access.actor,
    customerId: booking.customer_id,
    bookingId: booking.id,
    reference: booking.reference,
    pliantCardId: cardId,
    label: body.label,
    limitCents: body.limit.value,
    currency: body.limit.currency,
    kind: "creation",
    outcome: "ok",
  });

  return {
    cree: true as const,
    carte_id: carteId,
    dossier_id: booking.id,
    reference: booking.reference,
    nom: body.label,
    titulaire: holder(named.firstName, named.lastName),
    plafond: majorFromCents(body.limit.value),
    devise: body.limit.currency,
    transactions: body.maxTransactionCount,
    montant_transaction: majorFromCents(body.transactionLimit.value),
    valable_du: body.validFrom,
    valable_au: body.validTo,
    quatre_derniers: last4,
  };
}

export async function readPliantCard(
  input: { dossier_id?: string; reference?: string; carte_id?: string },
  admin: Admin = openDb(),
  deps: CardDeps = defaultDeps
) {
  const access = currentMcpAccess();
  const query = dossierQuery(input);
  const carteId = clean(input.carte_id);
  const auditBase = {
    actor: access.actor,
    bookingId: query.kind === "dossier" ? query.dossierId : null,
    reference: query.kind === "dossier" ? query.reference : null,
    kind: "reveal" as const,
  };

  if (access.cards !== true) {
    await writeCardAudit(admin, { ...auditBase, outcome: "refuse" });
    throw new McpReadError("Cet assistant n’est pas autorisé à lire une carte.");
  }
  if (carteId && carteId.length > 80) {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Identifiant inconnu." };
  }
  if (query.kind === "missing") {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Indiquez un identifiant de dossier ou une référence." };
  }
  if (query.kind === "invalid") {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Identifiant inconnu." };
  }

  const loaded = await loadBooking(admin, query);
  if (loaded.error) {
    await writeCardAudit(admin, { ...auditBase, outcome: "erreur" });
    throw new McpReadError("Lecture impossible.");
  }
  if (!loaded.rows.length) {
    await writeCardAudit(admin, { ...auditBase, outcome: "introuvable" });
    return { introuvable: true as const };
  }
  if (loaded.rows.length > 1) {
    await writeCardAudit(admin, { ...auditBase, outcome: "choix" });
    return {
      message: "Plusieurs dossiers correspondent. Précisez l’identifiant.",
      choix: loaded.rows.map((row) => ({ id: row.id, reference: row.reference, titre: row.title })),
    };
  }

  const booking = loaded.rows[0];
  const noted = {
    customerId: booking.customer_id,
    bookingId: booking.id,
    reference: booking.reference,
  };
  const { data, error } = await admin
    .from("crm_booking_cards")
    .select(
      "id, pliant_card_id, label, first_name, last_name, limit_cents, transaction_limit_cents, max_transaction_count, currency, status, last4"
    )
    .eq("booking_id", booking.id);
  if (error) {
    console.error("[mcp] carte", error.code ?? "?");
    await writeCardAudit(admin, { ...auditBase, ...noted, outcome: "erreur" });
    throw new McpReadError("Lecture impossible.");
  }
  const rows = (data || []) as CardRow[];
  const chosen = carteId ? rows.find((row) => sameId(row.id, carteId) || sameId(row.pliant_card_id, carteId)) || null : null;
  if (carteId && !chosen) {
    await writeCardAudit(admin, { ...auditBase, ...noted, outcome: "introuvable" });
    return { introuvable: true as const };
  }
  if (chosen && (chosen.status === "terminated" || chosen.status === "locked")) {
    await writeCardAudit(admin, {
      ...auditBase,
      ...noted,
      outcome: "invalide",
      pliantCardId: chosen.pliant_card_id,
      label: chosen.label,
      limitCents: chosen.limit_cents,
      currency: chosen.currency,
    });
    return {
      message: chosen.status === "terminated" ? "Cette carte est supprimée." : "Cette carte est bloquée.",
      carte: publicCard(chosen),
    };
  }

  const open = rows.filter((row) => row.status !== "terminated" && row.status !== "locked");
  const locked = rows.filter((row) => row.status === "locked");
  const card = chosen || (open.length === 1 ? open[0] : null);
  if (!card && open.length === 0 && locked.length === 1) {
    await writeCardAudit(admin, {
      ...auditBase,
      ...noted,
      outcome: "invalide",
      pliantCardId: locked[0].pliant_card_id,
      label: locked[0].label,
      limitCents: locked[0].limit_cents,
      currency: locked[0].currency,
    });
    return { message: "Cette carte est bloquée.", carte: publicCard(locked[0]) };
  }
  if (!card) {
    await writeCardAudit(admin, { ...auditBase, ...noted, outcome: open.length ? "choix" : "introuvable" });
    if (!open.length) return { introuvable: true as const, message: "Ce dossier n’a pas de carte active." };
    return {
      message: "Plusieurs cartes. Précisez carte_id.",
      choix: open.map(publicCard),
    };
  }

  const journal = {
    ...auditBase,
    ...noted,
    pliantCardId: card.pliant_card_id,
    label: card.label,
    limitCents: card.limit_cents,
    currency: card.currency,
  };
  const recorded = await writeCardAudit(admin, { ...journal, outcome: "ok" });
  if (!recorded) throw new McpReadError("La consultation n’a pas pu être notée.");
  if (!deps.configured()) {
    await writeCardAudit(admin, { ...journal, outcome: "erreur" });
    throw new McpReadError("Pliant n’est pas branché.");
  }

  let secrets: CardSecrets;
  try {
    secrets = await deps.secrets(card.pliant_card_id);
  } catch {
    console.error("[mcp] carte", "lecture");
    await writeCardAudit(admin, { ...journal, outcome: "erreur" });
    throw new McpReadError("Pliant n’a pas renvoyé la carte.");
  }
  if (!secrets.pan || !secrets.cvc || !secrets.expiry) {
    await writeCardAudit(admin, { ...journal, outcome: "erreur" });
    throw new McpReadError("Pliant n’a pas renvoyé la carte.");
  }

  return {
    carte_id: card.id,
    dossier_id: booking.id,
    reference: booking.reference,
    nom: card.label || "Carte",
    titulaire: holder(card.first_name, card.last_name),
    pan: secrets.pan,
    expiration: secrets.expiry,
    cvv: secrets.cvc,
    devise: card.currency || "EUR",
    plafond: majorFromCents(card.limit_cents),
    transactions: card.max_transaction_count,
    quatre_derniers: card.last4 && /^\d{4}$/.test(card.last4) ? card.last4 : null,
  };
}

export async function blockPliantCard(
  input: { dossier_id?: string; reference?: string; carte_id?: string; debloquer?: boolean },
  admin: Admin = openDb(),
  deps: CardDeps = defaultDeps
) {
  const access = currentMcpAccess();
  const query = dossierQuery(input);
  const carteId = clean(input.carte_id);
  const unlock = input.debloquer === true;
  const kind: CardKind = unlock ? "deblocage" : "blocage";
  const auditBase = {
    actor: access.actor,
    bookingId: query.kind === "dossier" ? query.dossierId : null,
    reference: query.kind === "dossier" ? query.reference : null,
    kind,
  };

  if (access.cards !== true) {
    await writeCardAudit(admin, { ...auditBase, outcome: "refuse" });
    throw new McpWriteError(unlock ? "Cet assistant n’est pas autorisé à débloquer une carte." : "Cet assistant n’est pas autorisé à bloquer une carte.");
  }
  if (carteId && carteId.length > 80) {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Identifiant inconnu." };
  }
  if (query.kind === "missing") {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Indiquez un identifiant de dossier ou une référence." };
  }
  if (query.kind === "invalid") {
    await writeCardAudit(admin, { ...auditBase, outcome: "invalide" });
    return { message: "Identifiant inconnu." };
  }

  const loaded = await loadBooking(admin, query);
  if (loaded.error) {
    await writeCardAudit(admin, { ...auditBase, outcome: "erreur" });
    throw new McpWriteError("Écriture impossible.");
  }
  if (!loaded.rows.length) {
    await writeCardAudit(admin, { ...auditBase, outcome: "introuvable" });
    return { introuvable: true as const };
  }
  if (loaded.rows.length > 1) {
    await writeCardAudit(admin, { ...auditBase, outcome: "choix" });
    return {
      message: "Plusieurs dossiers correspondent. Précisez l’identifiant.",
      choix: loaded.rows.map((row) => ({ id: row.id, reference: row.reference, titre: row.title })),
    };
  }

  const booking = loaded.rows[0];
  const noted = {
    customerId: booking.customer_id,
    bookingId: booking.id,
    reference: booking.reference,
  };
  const { data, error } = await admin
    .from("crm_booking_cards")
    .select(
      "id, pliant_card_id, label, first_name, last_name, limit_cents, transaction_limit_cents, max_transaction_count, currency, status, last4"
    )
    .eq("booking_id", booking.id);
  if (error) {
    console.error("[mcp] carte", error.code ?? "?");
    await writeCardAudit(admin, { ...auditBase, ...noted, outcome: "erreur" });
    throw new McpWriteError("Écriture impossible.");
  }
  const rows = ((data || []) as CardRow[]).filter((row) => row.status !== "terminated");
  const chosen = carteId ? rows.find((row) => sameId(row.id, carteId) || sameId(row.pliant_card_id, carteId)) || null : null;
  if (carteId && !chosen) {
    await writeCardAudit(admin, { ...auditBase, ...noted, outcome: "introuvable" });
    return { introuvable: true as const };
  }
  const card = chosen || (rows.length === 1 ? rows[0] : null);
  if (!card) {
    await writeCardAudit(admin, { ...auditBase, ...noted, outcome: rows.length ? "choix" : "introuvable" });
    if (!rows.length) return { introuvable: true as const, message: "Ce dossier n’a pas de carte à bloquer." };
    return { message: "Plusieurs cartes. Précisez carte_id.", choix: rows.map(publicCard) };
  }

  const journal = {
    ...auditBase,
    ...noted,
    pliantCardId: card.pliant_card_id,
    label: card.label,
    limitCents: card.limit_cents,
    currency: card.currency,
  };
  if (!deps.configured()) {
    await writeCardAudit(admin, { ...journal, outcome: "erreur" });
    throw new McpWriteError("Pliant n’est pas branché.");
  }

  try {
    if (unlock) await deps.unlock(card.pliant_card_id);
    else await deps.lock(card.pliant_card_id);
  } catch (err) {
    console.error("[mcp] carte", unlock ? "deblocage" : "blocage");
    await writeCardAudit(admin, { ...journal, outcome: "erreur" });
    throw new McpWriteError(publicFailure(err, unlock ? "Pliant n’a pas débloqué la carte." : "Pliant n’a pas bloqué la carte."));
  }

  const status = unlock ? "active" : "locked";
  const { error: saved } = await admin
    .from("crm_booking_cards")
    .update({ status })
    .eq("id", card.id)
    .eq("booking_id", booking.id);
  if (saved) {
    console.error("[mcp] carte dossier", saved.code ?? "?");
    await writeCardAudit(admin, { ...journal, outcome: "erreur" });
    throw new McpWriteError(
      unlock
        ? "Pliant a débloqué la carte, mais le dossier n’a pas enregistré le statut."
        : "Pliant a bloqué la carte, mais le dossier n’a pas enregistré le statut."
    );
  }
  card.status = status;
  await rememberPliantCard(admin, {
    pliant_card_id: card.pliant_card_id,
    customer_id: booking.customer_id,
    booking_id: booking.id,
    label: card.label,
    status,
  });
  await writeCardAudit(admin, { ...journal, outcome: "ok" });

  return {
    ...(unlock ? { debloquee: true as const } : { bloquee: true as const }),
    dossier_id: booking.id,
    reference: booking.reference,
    ...publicCard(card),
  };
}
