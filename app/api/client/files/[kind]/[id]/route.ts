import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import { signedCrmUrl } from "@/lib/crm/files";
import { createBusinessPdf, pdfResponse } from "@/lib/crm/pdf";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { kind, id } = await ctx.params;
  let path: string | null = null;
  let generatedInvoice: {
    number: string;
    kind: string;
    status: string;
    amount: number;
    currency: string;
    issued_on: string;
    due_on: string | null;
  } | null = null;

  if (kind === "identity") {
    const { data } = await auth.supabase
      .from("crm_travel_documents")
      .select("storage_path")
      .eq("id", id)
      .eq("customer_id", auth.customer.id)
      .maybeSingle();
    path = data?.storage_path || null;
  } else if (kind === "booking") {
    const { data } = await auth.supabase
      .from("crm_booking_documents")
      .select("storage_path, crm_bookings!inner(customer_id,status)")
      .eq("id", id)
      .eq("visible_to_client", true)
      .eq("crm_bookings.customer_id", auth.customer.id)
      .neq("crm_bookings.status", "draft")
      .maybeSingle();
    path = data?.storage_path || null;
  } else if (kind === "invoice") {
    const { data } = await auth.supabase
      .from("crm_invoices")
      .select("storage_path,number,kind,status,amount,currency,issued_on,due_on")
      .eq("id", id)
      .eq("customer_id", auth.customer.id)
      .neq("status", "draft")
      .maybeSingle();
    path = data?.storage_path || null;
    generatedInvoice = data || null;
  }

  if (!path && generatedInvoice) {
    const labels: Record<string, string> = { invoice: "Facture", receipt: "Reçu", credit_note: "Avoir", statement: "Relevé" };
    const pdf = await createBusinessPdf({
      title: labels[generatedInvoice.kind] || "Document comptable",
      reference: generatedInvoice.number,
      customer: `${auth.customer.first_name} ${auth.customer.last_name}`,
      metadata: [`Émis le ${generatedInvoice.issued_on}`, `Statut : ${generatedInvoice.status}`, ...(generatedInvoice.due_on ? [`Échéance : ${generatedInvoice.due_on}`] : [])],
      lines: [{ label: generatedInvoice.number, amount: Number(generatedInvoice.amount) }],
      total: Number(generatedInvoice.amount),
      currency: generatedInvoice.currency,
    });
    return pdfResponse(pdf, `${generatedInvoice.number}.pdf`);
  }
  if (!path) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  try {
    return NextResponse.redirect(await signedCrmUrl(path, 90));
  } catch {
    return NextResponse.json({ error: "Téléchargement temporairement indisponible" }, { status: 502 });
  }
}
