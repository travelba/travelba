import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import { createBusinessPdf, pdfResponse } from "@/lib/crm/pdf";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .select("occurred_on,direction,kind,label,amount,currency,status")
    .eq("customer_id", auth.customer.id)
    .eq("status", "posted")
    .order("occurred_on", { ascending: false })
    .limit(250);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data || [];
  const currency = rows[0]?.currency || "EUR";
  const balance = rows.filter((row) => row.currency === currency).reduce((sum, row) => sum + (row.direction === "credit" ? Number(row.amount) : -Number(row.amount)), 0);
  const pdf = await createBusinessPdf({
    title: "Relevé de compte",
    reference: `Situation au ${new Date().toLocaleDateString("fr-FR")}`,
    customer: `${auth.customer.first_name} ${auth.customer.last_name}`,
    lines: rows.map((row) => ({ label: `${row.occurred_on} · ${row.label}`, detail: `${row.kind} · ${row.status}`, amount: (row.direction === "credit" ? 1 : -1) * Number(row.amount) })),
    total: balance,
    currency,
    footer: "Un montant négatif correspond à un reste dû. Les devis non acceptés et écritures annulées sont exclus.",
  });
  return pdfResponse(pdf, `releve-travelba-${new Date().toISOString().slice(0, 10)}.pdf`);
}
