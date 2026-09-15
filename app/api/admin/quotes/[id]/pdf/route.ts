import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { createBusinessPdf, pdfResponse } from "@/lib/crm/pdf";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_quotes")
    .select("*, crm_quote_lines(*), crm_customers(first_name,last_name)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
  const customer = Array.isArray(data.crm_customers) ? data.crm_customers[0] : data.crm_customers;
  const lines = (data.crm_quote_lines || []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  const total = lines.filter((line: { optional: boolean; selected: boolean }) => !line.optional || line.selected).reduce((sum: number, line: { quantity: number; unit_price: number; tax_rate: number }) => sum + Number(line.quantity) * Number(line.unit_price) * (1 + Number(line.tax_rate) / 100), 0);
  const pdf = await createBusinessPdf({
    title: data.title,
    reference: `${data.reference} · version ${data.version}`,
    customer: `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(),
    metadata: [data.valid_until ? `Valable jusqu'au ${data.valid_until}` : "Sans date limite", `Statut : ${data.status}`],
    lines: lines.map((line: { title: string; description: string | null; quantity: number; unit_price: number }) => ({ label: line.title, detail: line.description || `${line.quantity} x ${line.unit_price}`, amount: Number(line.quantity) * Number(line.unit_price) })),
    total,
    currency: data.currency,
    footer: data.terms || undefined,
  });
  return pdfResponse(pdf, `${data.reference}.pdf`);
}
