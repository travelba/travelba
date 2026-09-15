import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { createBusinessPdf, pdfResponse } from "@/lib/crm/pdf";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data } = await auth.supabase
    .from("crm_invoices")
    .select("*, crm_customers(first_name,last_name), crm_bookings(reference,title)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  const customer = Array.isArray(data.crm_customers) ? data.crm_customers[0] : data.crm_customers;
  const booking = Array.isArray(data.crm_bookings) ? data.crm_bookings[0] : data.crm_bookings;
  const labels: Record<string, string> = { invoice: "Facture", receipt: "Reçu", credit_note: "Avoir", statement: "Relevé" };
  const pdf = await createBusinessPdf({
    title: labels[data.kind] || "Document comptable",
    reference: data.number,
    customer: `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(),
    metadata: [`Émis le ${data.issued_on}`, `Statut : ${data.status}`, ...(booking ? [`Dossier ${booking.reference} · ${booking.title}`] : [])],
    lines: [{ label: booking?.title || data.number, amount: Number(data.amount) }],
    total: Number(data.amount),
    currency: data.currency,
  });
  return pdfResponse(pdf, `${data.number}.pdf`);
}
