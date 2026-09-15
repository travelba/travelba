import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { QuoteEditor } from "@/components/admin/QuoteEditor";

type Props = { params: Promise<{ id: string }> };

export default async function AdminQuoteDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase } = await requireStaffPage("quotes");
  const { data } = await supabase.from("crm_quotes").select("*, crm_quote_lines(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-wide text-muted">{data.reference} · version {data.version}</p><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">{data.title}</h1></header>
      <QuoteEditor initialQuote={data} initialLines={(data.crm_quote_lines || []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)} />
    </div>
  );
}
