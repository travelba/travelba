import type { SupabaseClient } from "@supabase/supabase-js";
import { flightCountsInStay, itemSellingAmount } from "@/lib/crm/bookings";
import { passengersFromDetails } from "@/lib/crm/document-passengers";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import {
  Mb3mError,
  mb3mChangeFolder,
  mb3mFindCustomerPieces,
  mb3mGetInvoice,
  mb3mPartnerCode,
  mb3mRealm,
  mb3mRenderPiece,
  mb3mSaveFolder,
  mb3mSingleAgencyUid,
  type Mb3mRemoteInvoice,
} from "@/lib/crm/mb3m";
import { mb3mPieceUnchanged } from "@/lib/crm/sync-delta";
import { gdsMoveWarning, gdsPdfWarning } from "@/lib/crm/mb3m-prep";
import { isActiveItem } from "@/lib/crm/types";

/** Vol déjà facturé par l’import Amadeus de MB3M. */

export type GdsFlight = {
  itemId: string;
  label: string;
  /** PNR saisis (confirmation et détail), déjà normalisés, sans doublon. */
  pnrs: string[];
  amount: number | null;
  startAt: string | null;
  passengers: { firstName: string; lastName: string }[];
  transactionId: string | null;
  countsInStay: boolean;
};

export type GdsRemoteInvoice = {
  number: string;
  refCommand: string;
  folderId: string | null;
  cancelled: boolean;
  amount: number | null;
  date: string | null;
  activityIds: number[];
  travelers: { firstName: string; lastName: string }[];
  /** Émise dans MB3M (DatePrint). Une pro forma ne s’affiche pas au client. */
  printed?: boolean;
  uid?: string | null;
};

export type GdsCoverage = {
  itemId: string;
  label: string;
  pnr: string;
  invoiceNumber: string;
  transactionId: string | null;
  countsInStay: boolean;
  amount: number | null;
  folderId: string | null;
  /** move : pas de dossier. here : déjà celui du séjour. other : un autre dossier. */
  placement: "move" | "here" | "other";
  printed: boolean;
  pieceUid: string | null;
  /** ChangeFolder a refusé. La pièce reste liée au séjour dans le CRM. */
  moveWarning: string | null;
};

export type GdsSuggestion = {
  itemId: string;
  label: string;
  invoiceNumber: string;
};

const ITEM_ID = /:item:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function gdsPnr(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function day(value: string | null | undefined) {
  const text = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function daysApart(left: string, right: string) {
  const a = Date.parse(`${left}T00:00:00Z`);
  const b = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 99;
  return Math.abs(a - b) / 86_400_000;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function samePassenger(
  flight: { firstName: string; lastName: string },
  invoice: { firstName: string; lastName: string }
) {
  const flightLast = fold(flight.lastName);
  const invoiceLast = fold(invoice.lastName);
  if (!flightLast || flightLast !== invoiceLast) return false;
  const flightFirst = fold(flight.firstName);
  const invoiceFirst = fold(invoice.firstName);
  if (!flightFirst || !invoiceFirst) return true;
  return flightFirst === invoiceFirst || flightFirst.startsWith(invoiceFirst) || invoiceFirst.startsWith(flightFirst);
}

function namesMatch(flight: GdsFlight["passengers"], invoice: GdsRemoteInvoice["travelers"]) {
  if (!flight.length || !invoice.length) return false;
  return flight.every((person) => invoice.some((traveler) => samePassenger(person, traveler)));
}

function placement(folderId: string | null, dossierFolderId: string | null): GdsCoverage["placement"] {
  if (!folderId) return "move";
  if (dossierFolderId && folderId === dossierFolderId) return "here";
  return "other";
}

/**
 * PNR exact (casse et espaces ignorés). Plusieurs factures pour le même PNR : on s’arrête.
 * Sans PNR ou sans facture : la ligne reste, avec une suggestion si le montant, le jour et les noms collent.
 */
export function planGdsFlights(input: {
  flights: GdsFlight[];
  invoices: GdsRemoteInvoice[];
  dossierFolderId: string | null;
}): { covered: GdsCoverage[]; suggestions: GdsSuggestion[]; error: string | null } {
  const open = input.invoices.filter((invoice) => !invoice.cancelled && invoice.number.trim());
  const conflicts: string[] = [];
  const covered: GdsCoverage[] = [];
  const suggestions: GdsSuggestion[] = [];
  for (const flight of input.flights) {
    const pnrs = [...new Set(flight.pnrs.map(gdsPnr).filter(Boolean))];
    const hits = pnrs.length
      ? open.filter((invoice) => pnrs.includes(gdsPnr(invoice.refCommand)))
      : [];
    if (hits.length > 1) {
      const numbers = [...new Set(hits.map((invoice) => invoice.number))].join(", ");
      conflicts.push(`Le PNR ${pnrs.join(" / ")} est sur plusieurs factures MB3M : ${numbers}.`);
      continue;
    }
    if (hits.length === 1) {
      const invoice = hits[0];
      covered.push({
        itemId: flight.itemId,
        label: flight.label,
        pnr: gdsPnr(invoice.refCommand) || pnrs[0],
        invoiceNumber: invoice.number,
        transactionId: flight.transactionId,
        countsInStay: flight.countsInStay,
        amount: flight.amount,
        folderId: invoice.folderId,
        placement: placement(invoice.folderId, input.dossierFolderId),
        printed: invoice.printed === true,
        pieceUid: invoice.uid?.trim() || null,
        moveWarning: null,
      });
      continue;
    }
    const start = day(flight.startAt);
    if (flight.amount == null || !start || !flight.passengers.length) continue;
    for (const invoice of open) {
      if (invoice.folderId) continue;
      if (!invoice.activityIds.includes(2)) continue;
      if (invoice.amount == null || Math.abs(invoice.amount - flight.amount) > 1) continue;
      const invoiceDay = day(invoice.date);
      if (!invoiceDay || daysApart(start, invoiceDay) > 1) continue;
      if (!namesMatch(flight.passengers, invoice.travelers)) continue;
      suggestions.push({ itemId: flight.itemId, label: flight.label, invoiceNumber: invoice.number });
    }
  }
  if (conflicts.length) {
    return {
      covered: [],
      suggestions: [],
      error: `${conflicts.join(" ")} Aucune n’a été choisie.`,
    };
  }
  return { covered, suggestions, error: null };
}

type FlightItem = {
  id?: string | null;
  kind?: string | null;
  title?: string | null;
  confirmation_ref?: string | null;
  amount?: number | string | null;
  start_at?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

type FlightCharge = {
  id: string;
  external_id?: string | null;
  amount: number | string;
  kind?: string | null;
  direction?: string | null;
};

export function gdsFlightsFromStay(items: FlightItem[], charges: FlightCharge[]): GdsFlight[] {
  const active = items
    .filter((item) => isActiveItem(item))
    .map((item) => ({
      ...item,
      amount: item.amount == null || item.amount === "" ? null : Number(item.amount),
    }));
  const byItem = new Map<string, string>();
  for (const charge of charges) {
    const itemId = charge.external_id?.match(ITEM_ID)?.[1];
    if (itemId) byItem.set(itemId, charge.id);
  }
  return active.flatMap((item) => {
    if (item.kind !== "flight" || !item.id) return [];
    const details = item.details || {};
    const pnrs = [...new Set([gdsPnr(item.confirmation_ref), gdsPnr(details.pnr)].filter(Boolean))];
    const amount = itemSellingAmount({
      kind: "flight",
      amount: item.amount,
      details,
    });
    return [
      {
        itemId: item.id,
        label: (item.title || "").trim() || "Vol",
        pnrs,
        amount,
        startAt: item.start_at || null,
        passengers: passengersFromDetails(details).map((person) => ({
          firstName: person.first_name || "",
          lastName: person.last_name || "",
        })),
        transactionId: byItem.get(item.id) || null,
        countsInStay: flightCountsInStay(item, active),
      },
    ];
  });
}

/** Retire le vol de la facture CRM : sa ligne, ou sa part du montant du séjour. */
export function chargesWithoutGdsFlights<T extends FlightCharge>(charges: T[], covered: GdsCoverage[]): T[] {
  const itemIds = new Set(covered.map((row) => row.itemId));
  const transactionIds = new Set(covered.flatMap((row) => (row.transactionId ? [row.transactionId] : [])));
  const rollup = covered.reduce((sum, row) => {
    if (row.transactionId || !row.countsInStay || row.amount == null) return sum;
    return sum + row.amount;
  }, 0);
  let reduced = false;
  const next: T[] = [];
  for (const charge of charges) {
    const itemId = charge.external_id?.match(ITEM_ID)?.[1] || "";
    if ((itemId && itemIds.has(itemId)) || transactionIds.has(charge.id)) continue;
    const stay =
      charge.direction === "debit" && (charge.kind || "booking") === "booking" && !(charge.external_id || "").trim();
    if (stay && rollup > 0 && !reduced) {
      reduced = true;
      const amount = Math.round((Number(charge.amount) - rollup) * 100) / 100;
      if (amount > 0.005) next.push({ ...charge, amount });
      continue;
    }
    next.push(charge);
  }
  return next;
}

export type Mb3mGdsPlan = {
  covered: GdsCoverage[];
  suggestions: GdsSuggestion[];
  invoices: { number: string; amount: number }[];
  customerUid: string | null;
  folderId: string | null;
  warnings: string[];
};

/** Uid déjà connu : la fiche, sinon une pièce du séjour (la société n’est pas toujours dans crm_mb3m_parties). */
export function mb3mKnownCustomerUid(partyUid: string | null | undefined, pieceUids: (string | null | undefined)[]) {
  const party = (partyUid || "").trim();
  if (party) return party;
  return pieceUids.map((uid) => (uid || "").trim()).find(Boolean) || null;
}

async function payerMb3mUid(
  supabase: SupabaseClient,
  payerId: string,
  billingCompanyId: string | null,
  bookingId: string
) {
  let query = supabase.from("crm_mb3m_parties").select("mb3m_uid").eq("customer_id", payerId).eq("realm", mb3mRealm());
  query = billingCompanyId ? query.eq("billing_company_id", billingCompanyId) : query.is("billing_company_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Mb3mError("La fiche MB3M du client n’a pas pu être lue.", -1);
  const party = (data as { mb3m_uid?: string } | null)?.mb3m_uid?.trim() || "";
  const own = await supabase
    .from("crm_mb3m_pieces")
    .select("customer_uid")
    .eq("booking_id", bookingId)
    .eq("realm", mb3mRealm())
    .not("customer_uid", "is", null)
    .limit(1);
  if (own.error) throw new Mb3mError("La fiche MB3M du client n’a pas pu être lue.", -1);
  const onStay = ((own.data || []) as { customer_uid?: string | null }[]).map((row) => row.customer_uid);
  const known = mb3mKnownCustomerUid(party, onStay);
  if (known) return known;
  let stays = supabase
    .from("crm_bookings")
    .select("id")
    .or(`customer_id.eq.${payerId},billing_customer_id.eq.${payerId}`)
    .neq("id", bookingId);
  stays = billingCompanyId ? stays.eq("billing_company_id", billingCompanyId) : stays.is("billing_company_id", null);
  const { data: bookingRows, error: bookingError } = await stays;
  if (bookingError) throw new Mb3mError("La fiche MB3M du client n’a pas pu être lue.", -1);
  const ids = ((bookingRows || []) as { id?: string }[]).map((row) => row.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return null;
  const shared = await supabase
    .from("crm_mb3m_pieces")
    .select("customer_uid")
    .in("booking_id", ids)
    .eq("realm", mb3mRealm())
    .not("customer_uid", "is", null)
    .limit(1);
  if (shared.error) throw new Mb3mError("La fiche MB3M du client n’a pas pu être lue.", -1);
  return mb3mKnownCustomerUid(
    null,
    ((shared.data || []) as { customer_uid?: string | null }[]).map((row) => row.customer_uid)
  );
}

function summaryInvoice(piece: {
  number: string;
  refCommand: string;
  folderId: string | null;
  cancelled: boolean;
  amount: number | null;
  printed: boolean;
  uid: string | null;
}): Mb3mRemoteInvoice {
  return {
    number: piece.number,
    refCommand: piece.refCommand,
    folderId: piece.folderId,
    cancelled: piece.cancelled,
    amount: piece.amount,
    date: null,
    activityIds: [],
    travelers: [],
    printed: piece.printed,
    uid: piece.uid,
  };
}

/** Factures Amadeus du client, et les vols du séjour qu’elles couvrent déjà. */
export async function readMb3mGdsPlan(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    payerId: string;
    billingCompanyId: string | null;
    items: FlightItem[];
    charges: FlightCharge[];
    folderId: string | null;
  }
): Promise<Mb3mGdsPlan> {
  const flights = gdsFlightsFromStay(input.items, input.charges);
  const empty: Mb3mGdsPlan = {
    covered: [],
    suggestions: [],
    invoices: [],
    customerUid: null,
    folderId: input.folderId,
    warnings: [],
  };
  if (!flights.length) return empty;
  const customerUid = await payerMb3mUid(supabase, input.payerId, input.billingCompanyId, input.bookingId);
  const pnrs = [...new Set(flights.flatMap((flight) => flight.pnrs))];
  if (!customerUid) {
    console.info(`[mb3m] Amadeus séjour ${input.bookingId} : fiche inconnue, PNR ${pnrs.join(", ") || "aucun"}`);
    if (pnrs.length) {
      throw new Mb3mError("La fiche MB3M du client n’est pas connue : les factures Amadeus n’ont pas pu être cherchées.", -1);
    }
    return empty;
  }
  let summaries;
  try {
    summaries = await mb3mFindCustomerPieces(customerUid);
  } catch (err) {
    const message = err instanceof Error ? err.message : "lecture";
    throw new Mb3mError(`Les factures MB3M du client n’ont pas pu être lues. ${message}`, -1);
  }
  const open = summaries.filter((piece) => !piece.cancelled);
  const wanted = new Set(pnrs);
  const byNumber = new Map(open.map((piece) => [piece.number, summaryInvoice(piece)]));
  for (const piece of open) {
    const ref = gdsPnr(piece.refCommand);
    const matched = Boolean(ref) && wanted.has(ref);
    const needsDetail = !matched && !ref && !piece.folderId && wanted.size > 0;
    if (!needsDetail) continue;
    try {
      const detail = await mb3mGetInvoice(piece.number);
      byNumber.set(piece.number, {
        ...detail,
        printed: detail.printed || piece.printed,
        amount: detail.amount ?? piece.amount,
        uid: detail.uid || piece.uid,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "lecture";
      throw new Mb3mError(`La facture MB3M n° ${piece.number} n’a pas pu être lue. ${message}`, -1);
    }
  }
  const details = [...byNumber.values()];
  const plan = planGdsFlights({ flights, invoices: details, dossierFolderId: input.folderId });
  console.info(
    `[mb3m] Amadeus client ${customerUid} : ${open.length} pièce(s), PNR ${pnrs.join(", ") || "aucun"}, factures ${open
      .map((piece) => `${piece.number}:${gdsPnr(piece.refCommand) || "?"}`)
      .join(", ") || "aucune"}, couvert ${plan.covered.map((row) => row.invoiceNumber).join(", ") || "rien"}`
  );
  if (plan.error) throw new Mb3mError(plan.error, 0);
  const numbers = [...new Set(plan.covered.map((row) => row.invoiceNumber))];
  return {
    covered: plan.covered,
    suggestions: plan.suggestions,
    invoices: numbers.flatMap((number) => {
      const detail = details.find((invoice) => invoice.number === number);
      const fromFlights = plan.covered
        .filter((row) => row.invoiceNumber === number)
        .reduce((sum, row) => sum + (row.amount || 0), 0);
      const amount = detail?.amount ?? (fromFlights > 0 ? Math.round(fromFlights * 100) / 100 : null);
      return amount != null && amount > 0 ? [{ number, amount }] : [];
    }),
    customerUid,
    folderId: input.folderId,
    warnings: [],
  };
}

/** PDF demandé à MB3M, visible au client, même sans date d’impression. */
async function fileGdsInvoicePdf(
  supabase: SupabaseClient,
  bookingId: string,
  number: string,
  itemId: string | null,
  render: typeof mb3mRenderPiece = mb3mRenderPiece,
  upload: (path: string, bytes: Buffer, contentType: string) => Promise<unknown> = uploadCrmFile
): Promise<{ id: string | null; error: string | null }> {
  const fileName = `Facture n° ${number}.pdf`;
  try {
    const existing = await supabase
      .from("crm_booking_documents")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("file_name", fileName)
      .limit(1);
    const known = ((existing.data || []) as { id?: string }[])[0]?.id;
    if (known) return { id: String(known), error: null };
    const pdf = await render({ number });
    const path = `bookings/${bookingId}/${Date.now()}-${safeFileName(`Facture MB3M n° ${number}.pdf`)}`;
    await upload(path, pdf.bytes, "application/pdf");
    const { data, error } = await supabase
      .from("crm_booking_documents")
      .insert({
        booking_id: bookingId,
        booking_item_id: /^[0-9a-f-]{36}$/i.test(itemId || "") ? itemId : null,
        kind: "invoice",
        file_name: fileName,
        mime_type: "application/pdf",
        storage_path: path,
        visible_to_client: true,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      const message = error?.message || "Le document n’a pas pu être enregistré.";
      console.error("[mb3m] PDF Amadeus", message);
      return { id: null, error: message };
    }
    return { id: String(data.id), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "MB3M n’a pas renvoyé le PDF.";
    console.error("[mb3m] PDF Amadeus", number, message);
    return { id: null, error: message };
  }
}

/** Déplace les factures sans dossier, puis les note sur le séjour. */
export async function finishMb3mGds(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    plan: Mb3mGdsPlan;
    folderId: string | null;
    title: string;
    dateStart: string | null;
    dateEnd: string | null;
    destination: string | null;
    destinationIso: string | null;
    folderUid?: string | null;
  },
  deps?: {
    changeFolder?: typeof mb3mChangeFolder;
    renderPiece?: typeof mb3mRenderPiece;
    upload?: (path: string, bytes: Buffer, contentType: string) => Promise<unknown>;
  }
) {
  let folderId = input.folderId || input.plan.folderId;
  let folderUid = input.folderUid || null;
  const needsFolder = input.plan.covered.some((row) => row.placement === "move");
  if (needsFolder && !folderId && input.plan.customerUid && input.dateStart && input.dateEnd) {
    const folder = await mb3mSaveFolder({
      customerUid: input.plan.customerUid,
      title: input.title,
      folderType: "Prestation",
      dateStart: input.dateStart,
      dateEnd: input.dateEnd,
      destination: input.destination || undefined,
      destinationIso: input.destinationIso || undefined,
      codeRef: mb3mPartnerCode(input.bookingId),
      agencyUid: await mb3mSingleAgencyUid().catch(() => null),
    });
    folderId = folder.id;
    folderUid = folder.uid || folderUid;
    input.plan.folderId = folder.id;
  }
  if (folderId && !folderUid) {
    const known = await supabase
      .from("crm_mb3m_pieces")
      .select("folder_uid")
      .eq("booking_id", input.bookingId)
      .eq("realm", mb3mRealm())
      .eq("folder_id", folderId)
      .not("folder_uid", "is", null)
      .limit(1);
    if (known.error) throw new Mb3mError("Le dossier MB3M n’a pas pu être lu.", -1);
    folderUid = ((known.data || []) as { folder_uid?: string | null }[])[0]?.folder_uid || null;
  }
  const groups = new Map<string, GdsCoverage[]>();
  for (const row of input.plan.covered) {
    const list = groups.get(row.invoiceNumber) || [];
    list.push(row);
    groups.set(row.invoiceNumber, list);
  }
  for (const [number, rows] of groups) {
    const row = rows[0];
    if (row.placement === "move" && folderId) {
      try {
        await (deps?.changeFolder || mb3mChangeFolder)({
          number,
          folderId,
          folderUid,
          pieceUid: row.pieceUid,
        });
        for (const item of rows) {
          item.placement = "here";
          item.folderId = folderId;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "déplacement";
        const warning = gdsMoveWarning(number, message);
        for (const item of rows) item.moveWarning = warning;
        input.plan.warnings.push(warning);
      }
    }
    const lines = rows.map((item) => ({
      label: item.label,
      pnr: item.pnr,
      itemId: item.itemId,
      placement: item.placement,
    }));
    const transactionIds = [
      ...new Set(rows.map((item) => item.transactionId || "").filter((id) => /^[0-9a-f-]{36}$/i.test(id))),
    ];
    const existing = await supabase
      .from("crm_mb3m_pieces")
      .select("id, document_id, printed_at, folder_id, amount, lines, transaction_ids")
      .eq("booking_id", input.bookingId)
      .eq("kind", "gds")
      .eq("realm", mb3mRealm())
      .eq("piece_number", number)
      .maybeSingle();
    if (existing.error) throw new Mb3mError("La facture Amadeus n’a pas pu être notée sur le séjour.", -1);
    const stored = existing.data as {
      id: string;
      document_id: string | null;
      printed_at: string | null;
      folder_id: string | null;
      amount: number | null;
      lines: unknown;
      transaction_ids: string[] | null;
    } | null;
    let documentId = stored?.document_id || null;
    let printedAt = stored?.printed_at || null;
    if (!documentId) {
      const filed = await fileGdsInvoicePdf(
        supabase,
        input.bookingId,
        number,
        row.itemId,
        deps?.renderPiece,
        deps?.upload
      );
      if (filed.id) {
        documentId = filed.id;
        printedAt = printedAt || new Date().toISOString();
      } else if (filed.error) {
        input.plan.warnings.push(gdsPdfWarning(number, filed.error, Boolean(row.printed)));
      }
    }
    const payload = {
      folder_id: row.folderId,
      amount: row.amount,
      lines,
      transaction_ids: transactionIds,
      document_id: documentId,
      printed_at: printedAt,
      updated_at: new Date().toISOString(),
    };
    if (stored && mb3mPieceUnchanged(stored, payload)) continue;
    const saved = stored
      ? await supabase.from("crm_mb3m_pieces").update(payload).eq("id", stored.id)
      : await supabase.from("crm_mb3m_pieces").insert({
          booking_id: input.bookingId,
          kind: "gds",
          realm: mb3mRealm(),
          piece_number: number,
          currency: "EUR",
          ...payload,
        });
    if (saved.error) throw new Mb3mError("La facture Amadeus n’a pas pu être notée sur le séjour.", -1);
  }
  const warning = input.plan.warnings.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const noted = await supabase
    .from("crm_mb3m_pieces")
    .update({
      ...(warning ? { warning } : {}),
      attempt_status: null,
      attempt_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", input.bookingId)
    .eq("kind", "invoice")
    .eq("realm", mb3mRealm())
    .is("printed_at", null);
  if (noted.error) throw new Mb3mError("L’avertissement Amadeus n’a pas pu être enregistré.", -1);
  return folderId;
}
