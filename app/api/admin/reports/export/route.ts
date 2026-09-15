import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .select("occurred_on,direction,kind,label,amount,currency,status,source,crm_customers(first_name,last_name),crm_bookings(reference)")
    .order("occurred_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const header = ["Date", "Client", "Dossier", "Sens", "Type", "Libellé", "Montant", "Devise", "Statut", "Source"];
  const rows = (data || []).map((row) => {
    const customer = Array.isArray(row.crm_customers) ? row.crm_customers[0] : row.crm_customers;
    const booking = Array.isArray(row.crm_bookings) ? row.crm_bookings[0] : row.crm_bookings;
    return [row.occurred_on, `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(), booking?.reference || "", row.direction, row.kind, row.label, row.amount, row.currency, row.status, row.source].map(csvCell).join(",");
  });
  return new Response(`\uFEFF${header.map(csvCell).join(",")}\n${rows.join("\n")}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="travelba-transactions-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
