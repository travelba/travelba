import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import { createBusinessPdf, pdfResponse } from "@/lib/crm/pdf";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data } = await auth.supabase
    .from("crm_quotes")
    .select("*, crm_quote_lines(*)")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .neq("status", "draft")
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
  const lines = (data.crm_quote_lines || []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  const total = lines.filter((line: { optional: boolean; selected: boolean }) => !line.optional || line.selected).reduce((sum: number, line: { quantity: number; unit_price: number; tax_rate: number }) => sum + Number(line.quantity) * Number(line.unit_price) * (1 + Number(line.tax_rate) / 100), 0);
  const pdf = await createBusinessPdf({
    title: data.title,
    reference: `${data.reference} · version ${data.version}`,
    customer: `${auth.customer.first_name} ${auth.customer.last_name}`,
    metadata: [data.valid_until ? `Valable jusqu'au ${data.valid_until}` : "Sans date limite", `Statut : ${data.status}`],
    lines: lines.map((line: { title: string; description: string | null; quantity: number; unit_price: number }) => ({ label: line.title, detail: line.description || undefined, amount: Number(line.quantity) * Number(line.unit_price) })),
    total,
    currency: data.currency,
    footer: data.terms || undefined,
  });
  return pdfResponse(pdf, `${data.reference}.pdf`);
}
