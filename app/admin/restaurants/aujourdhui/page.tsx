import Link from "next/link";
import { redirect } from "next/navigation";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { loadTonight } from "@/lib/crm/restaurants-run";

export const metadata = { title: "Restaurants ce soir" };

const MESSAGE: Record<string, string> = {
  aucun: "Message pas encore envoyé",
  en_file: "En file",
  envoye: "Message envoyé",
  echec: "Échec d’envoi",
};

export default async function RestaurantsTonightPage() {
  const { supabase, staff } = await requireStaffPage();
  if (staff.role === "partner") redirect("/admin/little-emperors");
  const tonight = await loadTonight(supabase);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Ce soir"
          subtitle="Clients en séjour, heure locale. Le message part à 16 h. À 18 h, la table non choisie est à annuler."
          actions={
            <Link href="/admin/restaurants" className="admin-tap inline-flex min-h-11 items-center rounded-full border border-[#0B192C] px-4 text-sm font-semibold text-[#0B192C]">
              Catalogue
            </Link>
          }
        />
      </div>
      {tonight.ready ? null : <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-[#0B192C]">{tonight.message}</p>}
      {tonight.rows.length ? (
        <ul className="space-y-3">
          {tonight.rows.map((row) => (
            <li key={`${row.bookingId}-${row.date}`} className="admin-af-card space-y-2 rounded-3xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold text-[#0B192C]">{row.client}</p>
                  <p className="text-sm text-muted">
                    {row.reference}
                    {row.hotel ? ` · ${row.hotel}` : ""}
                    {row.city ? `, ${row.city}` : ""}
                  </p>
                  <p className="text-sm text-[#0B192C]">{row.timezone || "Fuseau inconnu"}</p>
                </div>
                <Link
                  href={`/admin/reservations/${row.bookingId}?tab=restaurants`}
                  className="admin-tap inline-flex min-h-11 items-center rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-white"
                >
                  Ouvrir
                </Link>
              </div>
              <p className="text-sm text-[#0B192C]">
                {MESSAGE[row.messageStatus] || row.messageStatus}
                {row.choice ? ` · choix ${row.choice === "aucune" ? "Aucune" : row.choice}` : " · sans réponse"}
              </p>
              <ul className="space-y-1 text-sm text-[#0B192C]">
                {row.tables.map((table) => (
                  <li key={table.seat}>
                    Table {table.seat}
                    {table.name ? ` · ${table.name}` : ""}
                    {table.time ? ` · ${table.time}` : ""} · {table.statusLabel}
                  </li>
                ))}
              </ul>
              {row.alerts.length ? (
                <ul className="flex flex-wrap gap-2">
                  {row.alerts.map((alert) => (
                    <li key={alert.id} className="rounded-full bg-[var(--admin-peach)] px-3 py-1 text-sm font-semibold text-[#0B192C]">
                      {alert.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : tonight.ready ? (
        <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Personne en séjour ce soir.</p>
      ) : null}
    </div>
  );
}
