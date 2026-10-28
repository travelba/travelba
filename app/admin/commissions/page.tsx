import Link from "next/link";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";
import { requireStaffPage } from "@/lib/crm/auth";
import { formatMoney } from "@/lib/crm/money";
import { formatCommissionRate } from "@/lib/crm/supplier-commission";
import { loadCommissionQueue, type CommissionQueueLine } from "@/lib/crm/supplier-commission-db";

export const metadata = { title: "Commissions à recevoir" };

const FILTERS = [
  { id: "", label: "Toutes" },
  { id: "attendues", label: "Attendues" },
  { id: "en_retard", label: "En retard" },
  { id: "recues", label: "Reçues" },
] as const;

function filtreOf(value: SearchParamValue) {
  const raw = firstParam(value) || "";
  if (raw === "attendues" || raw === "en_retard" || raw === "recues") return raw;
  return "";
}

function money(value: number | string | null) {
  if (value == null || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? formatMoney(amount) : "—";
}

function day(value: string | null) {
  if (!value) return "—";
  const [year, month, date] = value.slice(0, 10).split("-");
  return year && month && date ? `${date}/${month}/${year}` : value;
}

function statusLabel(row: CommissionQueueLine) {
  if (row.statut === "recue") return "Reçue";
  if (row.statut === "en_retard") return "En retard";
  return "Attendue";
}

/** File agence. Le client ne voit ni ces montants ni la marge. */
export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const { supabase } = await requireStaffPage();
  const params = await searchParams;
  const filtre = filtreOf(params.filtre);
  const status = filtre === "attendues" ? "attendue" : filtre === "en_retard" ? "en_retard" : filtre === "recues" ? "recue" : null;
  const queue = await loadCommissionQueue(supabase, status);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Argent</PageEyebrow>
        <PageTitle
          title="Commissions à recevoir"
          subtitle="Commission IATA indiquée par le fournisseur. La marge du dossier l’ajoute à la vente moins l’achat. Le client ne la voit pas."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const href = item.id ? `/admin/commissions?filtre=${item.id}` : "/admin/commissions";
          const active = filtre === item.id;
          return (
            <Link
              key={item.id || "toutes"}
              href={href}
              className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold ${
                active
                  ? "bg-[var(--admin-navy)] text-white"
                  : "border border-[var(--border)] bg-white text-[var(--admin-navy)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {!queue.disponible ? (
        <p className="text-sm text-muted">La liste n’est pas encore en place. Appliquez la migration, puis rouvrez cette page.</p>
      ) : queue.lignes.length === 0 ? (
        <p className="text-sm text-muted">Aucune commission dans ce filtre.</p>
      ) : (
        <ul className="space-y-2">
          {queue.lignes.map((row) => (
            <li key={row.booking_item_id} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/reservations/${row.booking_id}`} className="font-semibold text-[var(--admin-navy)] underline">
                    {row.reference || "Dossier"} · {row.title || row.dossier_titre || "Carte"}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    {[row.supplier, statusLabel(row), formatCommissionRate(row.commission_taux == null ? null : Number(row.commission_taux))]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums text-[var(--admin-navy)]">Attendue {money(row.commission_attendue)}</p>
                  <p className="tabular-nums text-muted">Reçue {money(row.commission_recue)}</p>
                  <p className="text-xs text-muted">
                    {row.statut === "recue" ? `Le ${day(row.commission_recue_le)}` : `Prévue le ${day(row.commission_date_prevue)}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
