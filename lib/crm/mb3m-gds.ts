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
};

async function payerMb3mUid(
  supabase: SupabaseClient,
  payerId: string,
  billingCompanyId: string | null
) {
  let query = supabase.from("crm_mb3m_parties").select("mb3m_uid").eq("customer_id", payerId).eq("realm", mb3mRealm());
  query = billingCompanyId ? query.eq("billing_company_id", billingCompanyId) : query.is("billing_company_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Mb3mError("La fiche MB3M du client n’a pas pu être lue.", -1);
  const uid = (data as { mb3m_uid?: string } | null)?.mb3m_uid?.trim() || "";
  return uid || null;
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
  };
  if (!flights.length) return empty;
  const customerUid = await payerMb3mUid(supabase, input.payerId, input.billingCompanyId);
  if (!customerUid) return empty;
  let summaries;
  try {
    summaries = await mb3mFindCustomerPieces(customerUid);
  } catch (err) {
    const message = err instanceof Error ? err.message : "lecture";
    throw new Mb3mError(`Les factures MB3M du client n’ont pas pu être lues. ${message}`, -1);
  }
  const open = summaries.filter((piece) => !piece.cancelled);
  const wanted = new Set(flights.flatMap((flight) => flight.pnrs));
  const details: Mb3mRemoteInvoice[] = [];
  for (const piece of open) {
    const ref = gdsPnr(piece.refCommand);
    const needsDetail = !ref || wanted.has(ref) || !piece.folderId;
    if (!needsDetail) continue;
    try {
      const detail = await mb3mGetInvoice(piece.number);
      details.push({ ...detail, printed: detail.printed || piece.printed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "lecture";
      throw new Mb3mError(`La facture MB3M n° ${piece.number} n’a pas pu être lue. ${message}`, -1);
    }
  }
  const plan = planGdsFlights({ flights, invoices: details, dossierFolderId: input.folderId });
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
  };
}

/** PDF de la facture émise, visible au client comme les autres factures du dossier. */
async function fileGdsInvoicePdf(supabase: SupabaseClient, bookingId: string, number: string) {
  try {
    const pdf = await mb3mRenderPiece({ number });
    const path = `bookings/${bookingId}/${Date.now()}-${safeFileName(`Facture MB3M n° ${number}.pdf`)}`;
    await uploadCrmFile(path, pdf.bytes, "application/pdf");
    const { data, error } = await supabase
      .from("crm_booking_documents")
      .insert({
        booking_id: bookingId,
        booking_item_id: null,
        kind: "invoice",
        file_name: `Facture n° ${number}.pdf`,
        mime_type: "application/pdf",
        storage_path: path,
        visible_to_client: true,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("[mb3m] PDF Amadeus", error?.message || "insert");
      return null;
    }
    return String(data.id);
  } catch (err) {
    console.error("[mb3m] PDF Amadeus", number, err instanceof Error ? err.message : err);
    return null;
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
  }
) {
  let folderId = input.folderId || input.plan.folderId;
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
    input.plan.folderId = folder.id;
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
        await mb3mChangeFolder({ number, folderId });
        for (const item of rows) {
          item.placement = "here";
          item.folderId = folderId;
        }
      } catch (err) {
        console.error("[mb3m] dossier Amadeus", number, err instanceof Error ? err.message : err);
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
      .select("id, document_id, printed_at")
      .eq("booking_id", input.bookingId)
      .eq("kind", "gds")
      .eq("realm", mb3mRealm())
      .eq("piece_number", number)
      .maybeSingle();
    if (existing.error) {
      console.error("[mb3m] mémoire Amadeus", existing.error.message);
      continue;
    }
    const stored = existing.data as { id: string; document_id: string | null; printed_at: string | null } | null;
    let documentId = stored?.document_id || null;
    let printedAt = stored?.printed_at || null;
    if (row.printed && !documentId) {
      const filed = await fileGdsInvoicePdf(supabase, input.bookingId, number);
      if (filed) {
        documentId = filed;
        printedAt = new Date().toISOString();
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
    if (saved.error) console.error("[mb3m] mémoire Amadeus", saved.error.message);
  }
  return folderId;
}
