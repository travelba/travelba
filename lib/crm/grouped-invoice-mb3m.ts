import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENCY_FEE_LABEL } from "@/lib/crm/agency-fee-rate";
import type { DbErrorLike } from "@/lib/crm/db-error";
import { formatDateFr } from "@/lib/crm/dates";
import {
  mb3mInvoiceBlocker,
  mb3mReplacementHold,
  MB3M_MIN_NET,
  type Mb3mInvoiceContext,
} from "@/lib/crm/mb3m-invoice";
import { mb3mSendableLines, mb3mSoapLines } from "@/lib/crm/mb3m-conform";
import { groupedMb3mPaymentWarning, recordMb3mInvoicePayments, type Mb3mReglement } from "@/lib/crm/mb3m-payments";
import { formatMoney } from "@/lib/crm/money";
import { MB3M_CANCEL_KEEPS_LETTERING } from "@/lib/crm/mb3m-unletter";
import { readMb3mParty, writeMb3mParty } from "@/lib/crm/mb3m-party";
import {
  mb3mAddInvoice,
  mb3mCancelInvoice,
  mb3mCollectCompanies,
  mb3mConfigured,
  mb3mFindPiece,
  mb3mReadLettrage,
  mb3mRealm,
  mb3mPartnerCode,
  mb3mSaveCompany,
  mb3mSaveFolder,
  mb3mSavePerson,
  mb3mSingleAgencyUid,
  selectMb3mCompany,
  Mb3mError,
  type Mb3mLettrageSnapshot,
  type Mb3mCompanyDraft,
  type Mb3mCustomerHit,
  type Mb3mLine,
  type Mb3mPersonDraft,
  type Mb3mTraveler,
} from "@/lib/crm/mb3m";
import type { Mb3mAccountLine } from "@/lib/crm/mb3m-account";

/**
 * Une seule pro forma MB3M pour plusieurs dossiers du même payeur.
 * AddPieces, puis les règlements reçus (SavePayment + WriteMatching) sur cette pièce.
 * Pas d’impression, pas de validation, pas de finalisation, pas d’avoir, pas de fournisseur créé.
 * Aucun e-mail, aucun message.
 */
export const GROUPED_MB3M_MIGRATION = "supabase/migrations/20261119201000_crm_grouped_invoice_mb3m.sql";

export const GROUPED_MB3M_COLUMNS =
  "mb3m_piece_number, mb3m_piece_uid, mb3m_folder_id, mb3m_customer_uid, mb3m_error";

/** Lectures et écritures utilisées. Aucune impression, validation ou finalisation. */
export const GROUPED_INVOICE_MB3M_CALLS = [
  "ConfigurationService/GetAgencies",
  "CustomerService/FindAll",
  "CustomerService/Save",
  "FolderService/FindAllPieces",
  "FolderService/Save",
  "FolderService/AddPieces",
  "FolderService/CancelInvoice",
  "FolderService/SavePayment",
  "PieceService/WriteMatching",
] as const;

export function groupedMb3mPrintedMessage(number: string) {
  return `La pièce MB3M n° ${number} est imprimée. Le CRM ne la remplace pas.`;
}

export function groupedMb3mPrintedRemovalMessage(number: string) {
  return `La pièce MB3M n° ${number.trim()} est imprimée. Le CRM ne retire pas cette facture groupée.`;
}

/** Écart TTC − solde, quand la pièce elle-même porte le lettrage. */
export function groupedPieceLetteredAmount(snap: Mb3mLettrageSnapshot): number | null {
  if (snap.amount == null || snap.balance == null) return null;
  const gap = Math.round((snap.amount - snap.balance) * 100) / 100;
  return gap > 0.005 ? gap : null;
}

/**
 * Refus d’annuler une pro forma lettrée. Le délettrage n’existe pas dans l’API :
 * il se fait dans MB3M.
 */
export function groupedMb3mLetteredRefusal(number: string, euros: number | null) {
  const amount =
    euros != null ? `porte ${formatMoney(euros)} de règlements lettrés` : "porte des règlements lettrés";
  return `La pièce MB3M n° ${number.trim()} ${amount} : délettrez-les d'abord dans MB3M. ${MB3M_CANCEL_KEEPS_LETTERING}`;
}

export type GroupedMb3mReleaseDeps = {
  configured: () => boolean;
  findPiece: (number: string) => Promise<"printed" | "open" | "missing">;
  readLettrage: (input: {
    number: string;
    folderId: string | null;
    customerUid: string | null;
  }) => Promise<Mb3mLettrageSnapshot>;
  cancelInvoice: (folderId: string, number: string) => Promise<void>;
};

export type GroupedMb3mRelease = { ok: true; clear: boolean } | { ok: false; error: string };

function mb3mSpokenError(error: unknown) {
  const message = (error instanceof Error ? error.message : "MB3M n’a pas répondu.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  return message || "MB3M n’a pas répondu. La facture groupée n’est pas retirée.";
}

/**
 * Relit la pièce avant de retirer la facture groupée.
 * Imprimée ou lettrée : rien n’est annulé. Sinon CancelInvoice.
 * `clear` : les colonnes mb3m_* et les traces de règlement peuvent être détachées.
 */
export async function releaseGroupedMb3mPiece(
  stored: { pieceNumber: string | null; folderId: string | null; customerUid: string | null },
  deps: GroupedMb3mReleaseDeps
): Promise<GroupedMb3mRelease> {
  const number = clean(stored.pieceNumber);
  if (!number) return { ok: true, clear: false };
  if (!deps.configured()) {
    return { ok: false, error: "L’accès MB3M n’est pas configuré. La facture groupée n’est pas retirée." };
  }
  let state: "printed" | "open" | "missing";
  try {
    state = await deps.findPiece(number);
  } catch (error) {
    return { ok: false, error: mb3mSpokenError(error) };
  }
  if (state === "printed") return { ok: false, error: groupedMb3mPrintedRemovalMessage(number) };
  if (state === "missing") return { ok: true, clear: true };
  let snap: Mb3mLettrageSnapshot;
  try {
    snap = await deps.readLettrage({
      number,
      folderId: clean(stored.folderId) || null,
      customerUid: clean(stored.customerUid) || null,
    });
  } catch (error) {
    return { ok: false, error: mb3mSpokenError(error) };
  }
  if (snap.lettered) {
    return { ok: false, error: groupedMb3mLetteredRefusal(number, groupedPieceLetteredAmount(snap)) };
  }
  const folderId = clean(stored.folderId);
  if (!folderId) {
    return {
      ok: false,
      error: `Le dossier MB3M de la pièce n° ${number} manque. La facture groupée n’est pas retirée.`,
    };
  }
  try {
    await deps.cancelInvoice(folderId, number);
  } catch (error) {
    return { ok: false, error: mb3mSpokenError(error) };
  }
  return { ok: true, clear: true };
}

/** Le paiement MB3M reste (pas de second SavePayment). Le lien vers cette pièce part. */
export async function detachGroupedMb3mPayments(admin: SupabaseClient, pieceNumber: string) {
  const number = clean(pieceNumber);
  if (!number) return;
  const matches = await admin.from("crm_mb3m_payment_matches").delete().eq("mb3m_invoice_number", number);
  if (matches.error) throw new Mb3mError("Les lettrages de la pièce n’ont pas été détachés.", -1);
  const { error } = await admin
    .from("crm_mb3m_payments")
    .update({ mb3m_invoice_number: null, mb3m_matching_id: null, matched_amount: 0 })
    .eq("realm", mb3mRealm())
    .eq("mb3m_invoice_number", number);
  if (error) throw new Mb3mError("Les règlements de la pièce n’ont pas été détachés.", -1);
}

export function groupedMb3mUnstoredMessage() {
  return `La pièce est créée. Son numéro n’est pas enregistré : la migration ${GROUPED_MB3M_MIGRATION} est à jouer à la main.`;
}

export type GroupedMb3mStored = {
  available: boolean;
  pieceNumber: string | null;
  pieceUid: string | null;
  folderId: string | null;
  customerUid: string | null;
  error: string | null;
};

export type GroupedMb3mDeps = {
  linkedCompany?: (input: { customerId: string; companyId: string }) => Promise<{ uid: string; partnerId?: string | null } | null>;
  findCompanies?: (query: { name: string; email?: string | null }) => Promise<Mb3mCustomerHit[]>;
  rememberCompany?: (input: {
    customerId: string;
    companyId: string;
    uid: string;
    partnerId: string | null;
  }) => Promise<void>;
  saveCompany: (draft: Mb3mCompanyDraft) => Promise<{ uid: string; partnerId: string }>;
  savePerson: (draft: Mb3mPersonDraft) => Promise<{ uid: string; partnerId: string }>;
  saveFolder: typeof mb3mSaveFolder;
  addInvoice: typeof mb3mAddInvoice;
  findPiece: typeof mb3mFindPiece;
  /** Solde et règlements avant de remplacer. Absent : la lecture MB3M. */
  readLettrage?: (input: {
    number: string;
    folderId: string | null;
    customerUid: string | null;
  }) => Promise<Mb3mLettrageSnapshot>;
  cancelInvoice: typeof mb3mCancelInvoice;
  agencyUid?: () => Promise<string | null>;
  /**
   * Règlements des dossiers inclus et du portefeuille, sur la pièce groupée.
   * Absent dans les tests qui ne couvrent pas l’encaissement.
   */
  recordPayments?: (input: {
    bookingIds: string[];
    folderId: string;
    customerUid: string;
    invoiceNumber: string;
    invoiceAmount: number;
    balance: number | null;
  }) => Promise<Mb3mReglement[]>;
};

export type GroupedMb3mPush = {
  number: string;
  uid: string;
  folderId: string;
  customerUid: string;
  replaced: boolean;
  avertissement: string | null;
  /** bloque_lettrage ou avertissement : la pro forma n’est pas remplacée, rien n’est écrit. */
  statut?: "bloque_lettrage" | "avertissement" | null;
  lignes: { dossier: string; libelle: string; activite: number | null; net: number; marge: number | null }[];
};

const EMPTY_STORED: GroupedMb3mStored = {
  available: false,
  pieceNumber: null,
  pieceUid: null,
  folderId: null,
  customerUid: null,
  error: null,
};

export function missingGroupedMb3mColumn(error: DbErrorLike) {
  if (!error) return false;
  const code = error.code || "";
  if (code !== "42703" && code !== "PGRST204") return false;
  const message = (error.message || "").toLowerCase();
  if (!message) return true;
  return message.includes("mb3m_");
}

function clean(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isAgencyCommissionLabel(label: string) {
  const fold = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'")
    .toLowerCase();
  return fold === "commission d'agence";
}

/** Repère d’un dossier : référence, destination, dates, voyageurs. */
export function groupedSectionMarker(input: {
  reference: string;
  destination: string;
  dates: string;
  travelers: string[];
}) {
  const people = input.travelers.map((name) => clean(name)).filter(Boolean).join(", ");
  return [input.reference, input.destination, input.dates, people]
    .map((part) => clean(part))
    .filter((part) => part && part !== "—")
    .join(" · ")
    .slice(0, 180);
}

export function groupedMarkerDates(start: string | null, end: string | null) {
  const shown = (value: string | null) => {
    const text = value ? formatDateFr(value) : "";
    return text && text !== "—" ? text : "";
  };
  const left = shown(start);
  const right = shown(end);
  if (left && right && left !== right) return `${left} — ${right}`;
  return left || right;
}

function referenceOf(marker: string) {
  return clean(marker.split(" · ")[0]) || clean(marker);
}

/**
 * Le premier frais Custom porte la référence, la destination, les dates et les voyageurs
 * quand le dossier n’a pas d’autre ligne. Les frais suivants gardent la référence dans le libellé.
 * Aucune ligne n’envoie de Note : le « + » MB3M reste vide. Le libellé d’une prestation ne change pas.
 * La commission d’agence garde son libellé, sans pourcentage.
 */
export function stampGroupedMb3mSection(marker: string, lines: Mb3mLine[]): Mb3mLine[] {
  const reference = referenceOf(marker);
  const hasStandard = lines.some((line) => line.type !== "Custom");
  let marked = false;
  return lines.map((line) => {
    const stripped = { ...line, note: null };
    if (line.type === "Custom") {
      const extra = !hasStandard && !marked ? marker : reference;
      marked = true;
      if (!extra || line.label.includes(extra) || (reference && line.label.includes(reference))) return stripped;
      return { ...stripped, label: `${line.label} · ${extra}`.slice(0, 120) };
    }
    marked = true;
    return stripped;
  });
}

function restoreAgencyCommission(sendable: Mb3mAccountLine[], soap: Mb3mLine[]) {
  const wanted = sendable.filter((line) => line.customCode && isAgencyCommissionLabel(line.label));
  if (!wanted.length) return soap;
  let index = 0;
  return soap.map((line) => {
    const code = line.customType?.complementary;
    const source = wanted[index];
    if (line.type !== "Custom" || !code || !source || source.customCode !== code) return line;
    index += 1;
    return { ...line, label: AGENCY_FEE_LABEL };
  });
}

function sectionSoap(lines: Mb3mAccountLine[]) {
  const sendable = mb3mSendableLines(lines);
  return restoreAgencyCommission(sendable, mb3mSoapLines(sendable, MB3M_MIN_NET));
}

export function assembleGroupedMb3m(contexts: Mb3mInvoiceContext[]) {
  const lines: Mb3mLine[] = [];
  const dossiers: string[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const starts: string[] = [];
  const ends: string[] = [];
  const places: string[] = [];
  const isos: string[] = [];
  const travelers: Mb3mTraveler[] = [];
  const seenTraveler = new Set<string>();
  for (const ctx of contexts) {
    if (ctx.dateStart) starts.push(ctx.dateStart);
    if (ctx.dateEnd) ends.push(ctx.dateEnd);
    if (ctx.destination) places.push(ctx.destination);
    if (ctx.destinationIso) isos.push(ctx.destinationIso);
    for (const traveler of ctx.travelers) {
      const key = `${traveler.firstName} ${traveler.lastName}`.toLowerCase();
      if (!traveler.firstName || !traveler.lastName || seenTraveler.has(key)) continue;
      seenTraveler.add(key);
      travelers.push({ firstName: traveler.firstName, name: traveler.lastName });
    }
    const notice = clean(ctx.notice);
    if (notice && !warnings.includes(notice)) warnings.push(notice);
    const soap = sectionSoap(ctx.lines);
    if (!soap.length) {
      skipped.push(ctx.reference);
      continue;
    }
    const marker = groupedSectionMarker({
      reference: ctx.reference,
      destination: ctx.destination || "",
      dates: groupedMarkerDates(ctx.dateStart, ctx.dateEnd),
      travelers: ctx.travelers.map((traveler) => `${traveler.firstName} ${traveler.lastName}`),
    });
    for (const line of stampGroupedMb3mSection(marker, soap)) {
      lines.push(line);
      dossiers.push(ctx.reference);
    }
  }
  const dateStart = starts.sort()[0] || null;
  const dateEnd = ends.sort().at(-1) || null;
  const destination = uniqueJoin(places);
  const uniqueIso = [...new Set(isos)];
  return {
    lines,
    dossiers,
    dateStart,
    dateEnd,
    destination: destination || null,
    destinationIso: uniqueIso.length === 1 ? uniqueIso[0] : null,
    travelers: travelers.slice(0, 24),
    warnings,
    skipped,
  };
}

function uniqueJoin(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.join(", ").slice(0, 120);
}

function pieceTitle(number: string) {
  return `Facture groupée ${number}`.slice(0, 120);
}

function publicLines(lines: Mb3mLine[], dossiers: string[]) {
  return lines.map((line, index) => ({
    dossier: dossiers[index] || "",
    libelle: line.label,
    activite: line.activityId ?? null,
    net: line.netPriceTotal,
    marge: line.marginUnit ?? null,
  }));
}

function mergedBlocker(contexts: Mb3mInvoiceContext[], built: ReturnType<typeof assembleGroupedMb3m>) {
  const head = contexts[0];
  if (!head) return "Aucun dossier à facturer.";
  if (contexts.some((ctx) => ctx.currency !== "EUR")) return "Un séjour n’est pas en euros.";
  const lines = contexts.flatMap((ctx) => ctx.lines);
  return mb3mInvoiceBlocker({
    ...head,
    currency: "EUR",
    dateStart: built.dateStart,
    dateEnd: built.dateEnd,
    lines,
    hadExpenses: lines.length > 0,
    configured: mb3mConfigured(),
  });
}

async function rememberCompany(
  deps: GroupedMb3mDeps,
  customerId: string,
  companyId: string,
  uid: string,
  partnerId: string | null
) {
  if (!deps.rememberCompany) return;
  try {
    await deps.rememberCompany({ customerId, companyId, uid, partnerId });
  } catch (error) {
    console.error("[mb3m] lien société non enregistré", error instanceof Error ? error.message : "erreur");
  }
}

async function resolveCustomer(
  ctx: Mb3mInvoiceContext,
  customerId: string,
  knownUid: string | null,
  deps: GroupedMb3mDeps
) {
  if (knownUid) return knownUid;
  const company = ctx.company;
  const address = company?.address || null;
  if (ctx.payerKind === "company" && company && address) {
    if (deps.linkedCompany) {
      const known = await deps.linkedCompany({ customerId, companyId: company.id });
      if (known?.uid) return known.uid;
    }
    if (deps.findCompanies) {
      const hits = await deps.findCompanies({ name: company.name, email: company.email });
      const pick = selectMb3mCompany(hits, {
        name: company.name,
        email: company.email,
        countryCode: address.countryCode || company.countryCode,
        siret: company.siret,
        registrationNumber: company.registrationNumber,
      });
      if (pick.status === "match") {
        await rememberCompany(deps, customerId, company.id, pick.company.uid, (pick.company.partnerId || "").trim() || null);
        return pick.company.uid;
      }
      if (pick.status === "ambiguous") {
        throw new Mb3mError(`Plusieurs sociétés MB3M portent le nom « ${company.name} ». La facture n’en a pas choisi une.`, -1);
      }
    }
    const saved = await deps.saveCompany({
      partnerId: mb3mPartnerCode(company.id),
      name: company.name,
      commercialName: company.commercialName || company.name,
      email: company.email || undefined,
      phoneNumber: company.phoneNumber,
      address,
    });
    await rememberCompany(deps, customerId, company.id, saved.uid, saved.partnerId || null);
    return saved.uid;
  }
  const person = ctx.person;
  if (!person?.address) throw new Mb3mError("La fiche du payeur est incomplète.", 0);
  const saved = await deps.savePerson({
    partnerId: mb3mPartnerCode(person.id),
    civility: person.civility,
    firstName: person.firstName,
    name: person.lastName,
    email: person.email || undefined,
    address: person.address,
    birthDate: person.birthDate,
    country: person.country,
    mobileNumber: person.mobileNumber,
    phoneNumber: person.phoneNumber,
  });
  return saved.uid;
}

function pieceAmount(lines: Mb3mLine[]) {
  return (
    Math.round(lines.reduce((sum, line) => sum + (Number(line.netPriceTotal) || 0) + (Number(line.marginUnit) || 0), 0) * 100) /
    100
  );
}

function joinWarnings(...parts: (string | null | undefined)[]) {
  return parts.map((part) => clean(part)).filter(Boolean).join(" ") || null;
}

const UNREAD_PAYMENTS = "Les règlements ne sont pas envoyés : le solde de la pièce n’a pas pu être lu.";

/**
 * SavePayment + WriteMatching après la pièce. Un échec reste un avertissement.
 * Sans solde connu, rien n’est envoyé.
 */
async function settleGroupedPayments(
  deps: GroupedMb3mDeps,
  input: {
    contexts: Mb3mInvoiceContext[];
    folderId: string;
    customerUid: string;
    invoiceNumber: string;
    invoiceAmount: number;
    balance: number | null;
  }
): Promise<string | null> {
  if (!deps.recordPayments) return null;
  const folderId = clean(input.folderId);
  const customerUid = clean(input.customerUid);
  const invoiceNumber = clean(input.invoiceNumber);
  if (!folderId || !customerUid || !invoiceNumber) {
    return "Les règlements ne sont pas envoyés : le dossier MB3M ou le client de la pièce manque.";
  }
  if (input.balance == null) return UNREAD_PAYMENTS;
  if (input.balance <= 0.005) return null;
  try {
    const reglements = await deps.recordPayments({
      bookingIds: input.contexts.map((ctx) => ctx.bookingId).filter(Boolean),
      folderId,
      customerUid,
      invoiceNumber,
      invoiceAmount: input.invoiceAmount,
      balance: input.balance,
    });
    return groupedMb3mPaymentWarning(reglements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le règlement n’a pas abouti.";
    return `Les règlements n’ont pas été envoyés sur la facture groupée. ${message} La facture groupée reste en place.`
      .replace(/\s+/g, " ")
      .trim();
  }
}

/**
 * Crée ou remplace la pro forma. Une pièce imprimée ou déjà lettrée n’est pas remplacée.
 * Les règlements partent ensuite sur la pièce qui reste (créée, déjà là, ou imprimée).
 * L’appelant ne doit pas passer ici pour un aperçu.
 */
export async function emitGroupedMb3mPiece(
  input: {
    customerId: string;
    invoiceId: string;
    number: string;
    contexts: Mb3mInvoiceContext[];
    previous: { pieceNumber: string | null; folderId: string | null; customerUid: string | null };
  },
  deps: GroupedMb3mDeps
): Promise<GroupedMb3mPush> {
  if (!mb3mConfigured()) throw new Mb3mError("L’accès MB3M n’est pas configuré.", 0);
  if (input.contexts.length < 2) throw new Mb3mError("Une facture groupée réunit au moins deux dossiers.", 0);
  const payerKey = `${input.contexts[0]?.payerKind}:${input.contexts[0]?.company?.id || ""}`;
  if (input.contexts.some((ctx) => `${ctx.payerKind}:${ctx.company?.id || ""}` !== payerKey)) {
    throw new Mb3mError("Ces dossiers n’ont pas le même payeur.", 0);
  }
  const built = assembleGroupedMb3m(input.contexts);
  const blocker = mergedBlocker(input.contexts, built);
  const previousNumber = clean(input.previous.pieceNumber);
  const lignes = publicLines(built.lines, built.dossiers);
  let openPrevious: { number: string; folderId: string | null } | null = null;
  if (previousNumber) {
    const state = await deps.findPiece(previousNumber);
    if (state === "printed") {
      const payments = await settleKnownPiece(deps, input.contexts, {
        number: previousNumber,
        folderId: input.previous.folderId,
        customerUid: input.previous.customerUid,
        fallbackAmount: pieceAmount(built.lines),
      });
      return {
        number: previousNumber,
        uid: "",
        folderId: clean(input.previous.folderId),
        customerUid: clean(input.previous.customerUid),
        replaced: false,
        avertissement: joinWarnings(groupedMb3mPrintedMessage(previousNumber), payments),
        lignes,
      };
    }
    if (state === "open") openPrevious = { number: previousNumber, folderId: input.previous.folderId };
  }
  if (blocker || !built.lines.length) {
    const skipped = built.skipped.length ? ` Sans ligne envoyée : ${built.skipped.join(", ")}.` : "";
    throw new Mb3mError(`${blocker || "Aucune dépense de ces séjours n’est au grand livre."}${skipped}`.trim(), 0);
  }
  if (!built.dateStart || !built.dateEnd) throw new Mb3mError("Les dates des séjours manquent.", 0);

  if (openPrevious) {
    const nextAmount = pieceAmount(built.lines);
    const hold = await mb3mReplacementHold(deps.readLettrage ?? mb3mReadLettrage, {
      number: openPrevious.number,
      folderId: openPrevious.folderId,
      customerUid: clean(input.previous.customerUid) || null,
      nextAmount,
      currentAmount: null,
    });
    if (hold) {
      const payments =
        hold.statut === "bloque_lettrage"
          ? await settleKnownPiece(deps, input.contexts, {
              number: openPrevious.number,
              folderId: openPrevious.folderId,
              customerUid: input.previous.customerUid,
              fallbackAmount: nextAmount,
            })
          : UNREAD_PAYMENTS;
      return {
        number: openPrevious.number,
        uid: "",
        folderId: openPrevious.folderId || "",
        customerUid: clean(input.previous.customerUid),
        replaced: false,
        avertissement: joinWarnings(hold.avertissement, payments),
        statut: hold.statut,
        lignes,
      };
    }
  }

  const customerUid = await resolveCustomer(
    input.contexts[0],
    input.customerId,
    clean(input.previous.customerUid) || null,
    deps
  );
  const agencyUid = deps.agencyUid ? await deps.agencyUid().catch(() => null) : null;
  const folder = await deps.saveFolder({
    customerUid,
    title: pieceTitle(input.number),
    folderType: "Prestation",
    dateStart: built.dateStart,
    dateEnd: built.dateEnd,
    destination: built.destination || undefined,
    destinationIso: built.destinationIso || undefined,
    codeRef: mb3mPartnerCode(input.invoiceId),
    id: input.previous.folderId || undefined,
    agencyUid,
  });
  const folderId = input.previous.folderId || folder.id;
  const invoice = await deps.addInvoice({
    folderId,
    customerUid,
    title: pieceTitle(input.number),
    refCommand: input.number,
    dateStart: built.dateStart,
    dateEnd: built.dateEnd,
    destination: built.destination || undefined,
    destinationIso: built.destinationIso || undefined,
    lines: built.lines,
    travelers: built.travelers,
    agencyUid,
    replacesNumber: openPrevious?.number,
  });
  if (openPrevious && openPrevious.number !== invoice.number) {
    try {
      await deps.cancelInvoice(openPrevious.folderId || folderId, openPrevious.number);
    } catch (error) {
      const message = error instanceof Error ? error.message : "annulation";
      try {
        await deps.cancelInvoice(folderId, invoice.number);
      } catch (undo) {
        console.error(
          `[mb3m] la nouvelle pro forma n° ${invoice.number} n’a pas pu être retirée`,
          undo instanceof Error ? undo.message : undo
        );
      }
      throw new Mb3mError(`La pro forma n° ${openPrevious.number} n’a pas pu être annulée. ${message}`, -1);
    }
  }
  const held = built.warnings.filter(Boolean).join(" ");
  const skipped = built.skipped.length ? `Dossiers sans ligne envoyée : ${built.skipped.join(", ")}.` : "";
  const amount = pieceAmount(built.lines);
  const payments = await settleGroupedPayments(deps, {
    contexts: input.contexts,
    folderId,
    customerUid,
    invoiceNumber: invoice.number,
    invoiceAmount: amount,
    balance: amount,
  });
  console.info(`[mb3m] facture groupée ${input.number} pro forma ${invoice.number}`);
  return {
    number: invoice.number,
    uid: invoice.uid || "",
    folderId,
    customerUid,
    replaced: Boolean(openPrevious),
    avertissement: joinWarnings(held, skipped, payments),
    lignes,
  };
}

/** Relit le solde, puis lettre sans remplacer la pièce. */
async function settleKnownPiece(
  deps: GroupedMb3mDeps,
  contexts: Mb3mInvoiceContext[],
  piece: { number: string; folderId: string | null; customerUid: string | null; fallbackAmount: number }
) {
  try {
    const snap = await (deps.readLettrage ?? mb3mReadLettrage)({
      number: piece.number,
      folderId: piece.folderId,
      customerUid: clean(piece.customerUid) || null,
    });
    return settleGroupedPayments(deps, {
      contexts,
      folderId: piece.folderId || "",
      customerUid: clean(piece.customerUid),
      invoiceNumber: piece.number,
      invoiceAmount: snap.amount ?? piece.fallbackAmount,
      balance: snap.balance,
    });
  } catch {
    return UNREAD_PAYMENTS;
  }
}

export function groupedMb3mDeps(admin: SupabaseClient): GroupedMb3mDeps {
  return {
    linkedCompany: ({ customerId, companyId }) => readMb3mParty(admin, customerId, companyId),
    findCompanies: (query) => mb3mCollectCompanies(query),
    rememberCompany: ({ customerId, companyId, uid, partnerId }) =>
      writeMb3mParty(admin, customerId, companyId, uid, partnerId),
    saveCompany: mb3mSaveCompany,
    savePerson: mb3mSavePerson,
    saveFolder: mb3mSaveFolder,
    addInvoice: mb3mAddInvoice,
    findPiece: mb3mFindPiece,
    readLettrage: mb3mReadLettrage,
    cancelInvoice: mb3mCancelInvoice,
    agencyUid: mb3mSingleAgencyUid,
    recordPayments: (payment) =>
      recordMb3mInvoicePayments(admin, {
        bookingId: payment.bookingIds[0] || "",
        bookingIds: payment.bookingIds,
        folderId: payment.folderId,
        customerUid: payment.customerUid,
        invoiceNumber: payment.invoiceNumber,
        invoiceAmount: payment.invoiceAmount,
        balance: payment.balance,
        grouped: true,
      }),
  };
}

function storedFromRow(row: {
  mb3m_piece_number?: string | null;
  mb3m_piece_uid?: string | null;
  mb3m_folder_id?: string | null;
  mb3m_customer_uid?: string | null;
  mb3m_error?: string | null;
} | null): GroupedMb3mStored {
  if (!row) return { ...EMPTY_STORED, available: true };
  return {
    available: true,
    pieceNumber: clean(row.mb3m_piece_number) || null,
    pieceUid: clean(row.mb3m_piece_uid) || null,
    folderId: clean(row.mb3m_folder_id) || null,
    customerUid: clean(row.mb3m_customer_uid) || null,
    error: clean(row.mb3m_error) || null,
  };
}

export async function readGroupedMb3m(admin: SupabaseClient, invoiceId: string): Promise<GroupedMb3mStored> {
  const { data, error } = await admin
    .from("crm_grouped_invoices")
    .select(GROUPED_MB3M_COLUMNS)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error && missingGroupedMb3mColumn(error)) return { ...EMPTY_STORED };
  if (error) throw new Mb3mError("La référence MB3M n’est pas lisible.", -1);
  return storedFromRow(data as Parameters<typeof storedFromRow>[0]);
}

export async function readGroupedMb3mForCustomer(admin: SupabaseClient, customerId: string) {
  const { data, error } = await admin
    .from("crm_grouped_invoices")
    .select(`id, ${GROUPED_MB3M_COLUMNS}`)
    .eq("customer_id", customerId);
  if (error && missingGroupedMb3mColumn(error)) {
    return { available: false as const, rows: new Map<string, GroupedMb3mStored>(), error: null };
  }
  if (error) return { available: false as const, rows: new Map<string, GroupedMb3mStored>(), error: "Les références MB3M ne sont pas lisibles." };
  const rows = new Map<string, GroupedMb3mStored>();
  for (const row of (data || []) as ({ id: string } & Parameters<typeof storedFromRow>[0])[]) {
    rows.set(row.id, storedFromRow(row));
  }
  return { available: true as const, rows, error: null as string | null };
}

export async function writeGroupedMb3m(
  admin: SupabaseClient,
  invoiceId: string,
  patch: {
    pieceNumber?: string | null;
    pieceUid?: string | null;
    folderId?: string | null;
    customerUid?: string | null;
    error?: string | null;
  }
) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("pieceNumber" in patch) row.mb3m_piece_number = patch.pieceNumber ?? null;
  if ("pieceUid" in patch) row.mb3m_piece_uid = patch.pieceUid ?? null;
  if ("folderId" in patch) row.mb3m_folder_id = patch.folderId ?? null;
  if ("customerUid" in patch) row.mb3m_customer_uid = patch.customerUid ?? null;
  if ("error" in patch) row.mb3m_error = patch.error ? patch.error.slice(0, 1000) : null;
  const { error } = await admin.from("crm_grouped_invoices").update(row).eq("id", invoiceId);
  if (error && missingGroupedMb3mColumn(error)) return false;
  if (error) throw new Mb3mError("La référence MB3M n’a pas été enregistrée.", -1);
  return true;
}
