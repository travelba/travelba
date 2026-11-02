import { mb3mFactureHref } from "@/lib/crm/mb3m-account";
import { mb3mRealm } from "@/lib/crm/mb3m";
import { invoiceDocument, type InvoiceInput } from "@/lib/crm/invoice-document";
import { loadInvoiceSnapshot } from "@/lib/crm/invoice-context";
import { renderInvoicePdf } from "@/lib/crm/invoice-pdf";
import { createServiceClient } from "@/lib/supabase/admin";

export type Mb3mProformaLine = { label: string; amount: number };
export type Mb3mProformaModel = InvoiceInput;

export function mb3mProformaCopy(model: InvoiceInput) {
  const doc = invoiceDocument(model);
  return {
    kicker: doc.kicker,
    number: doc.numberLabel,
    notice: doc.legal.at(-1) || "",
    stay: [doc.title, doc.reference, doc.dates].filter(Boolean),
    billTo: doc.billTo,
    lines: doc.lines.map((line) => ({ label: line.label, amount: line.amountLabel })),
    total: doc.totalLabel,
    issuer: doc.issuer,
    balance: doc.balanceLabel,
    due: doc.dueLabel,
  };
}

export async function renderMb3mProformaPdf(model: InvoiceInput) {
  return renderInvoicePdf(model);
}

type PieceRow = {
  booking_id: string;
  piece_number: string | null;
  document_id: string | null;
  printed_at: string | null;
};

/** Aperçu client, ou la pièce déjà imprimée (fichier déposé). */
export async function loadMb3mProforma(bookingId: string) {
  const admin = createServiceClient();
  const { data: open, error } = await admin
    .from("crm_mb3m_pieces")
    .select("booking_id, piece_number, document_id, printed_at")
    .eq("booking_id", bookingId)
    .eq("realm", mb3mRealm())
    .eq("kind", "invoice")
    .is("printed_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const piece = open as PieceRow | null;
  if ((piece?.piece_number || "").trim()) {
    const snapshot = await loadInvoiceSnapshot(admin, bookingId);
    if (!snapshot) throw new Error("La facture pro forma n’est pas lisible.");
    const pdf = await renderInvoicePdf(snapshot.document);
    return { kind: "preview" as const, pdf, number: snapshot.document.number };
  }
  const { data: printed, error: printedError } = await admin
    .from("crm_mb3m_pieces")
    .select("booking_id, piece_number, document_id, printed_at")
    .eq("booking_id", bookingId)
    .eq("realm", mb3mRealm())
    .eq("kind", "invoice")
    .not("printed_at", "is", null)
    .order("printed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (printedError) throw new Error(printedError.message);
  const issued = printed as PieceRow | null;
  const number = (issued?.piece_number || "").trim();
  if (!issued || !number || !issued.document_id) return null;
  const { data: document, error: documentError } = await admin
    .from("crm_booking_documents")
    .select("storage_path")
    .eq("id", issued.document_id)
    .maybeSingle();
  if (documentError) throw new Error(documentError.message);
  const path = (document as { storage_path?: string | null } | null)?.storage_path;
  if (!path) return null;
  return { kind: "official" as const, href: mb3mFactureHref(path, number), number };
}
