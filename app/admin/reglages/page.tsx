import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLaunchStatus } from "@/components/admin/AdminLaunchStatus";
import { requireStaffPage } from "@/lib/crm/auth";
import { buildLaunchItems } from "@/lib/crm/launch-status";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";

export const metadata = { title: "Réglages" };

const LINKS = [
  { href: "/admin/equipe", title: "Équipe", text: "Collègues et partenaire MyLER." },
  { href: "/admin/concierge", title: "Savoir du Concierge", text: "Ce que le Concierge sait répondre au client." },
];

/** Mise en service et raccourcis d’administration. Les agents arrivent sur les modèles WhatsApp. */
export default async function ReglagesPage() {
  const { supabase, staff } = await requireStaffPage();
  if (staff.role !== "admin") redirect("/admin/reglages/whatsapp");

  const [{ count: bookingCount }, { count: publishedCount }, { count: customerCount }, { count: withPhoneCount }, revolutIsConnected] =
    await Promise.all([
      supabase.from("crm_bookings").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase
        .from("crm_bookings")
        .select("id", { count: "exact", head: true })
        .eq("visible_to_client", true)
        .is("archived_at", null),
      supabase.from("crm_customers").select("id", { count: "exact", head: true }),
      supabase
        .from("crm_customers")
        .select("id", { count: "exact", head: true })
        .not("phone", "is", null)
        .neq("phone", ""),
      revolutConnected(),
    ]);
  const customersTotal = customerCount ?? 0;
  const items = buildLaunchItems({
    customerCount: customersTotal,
    customersWithoutPhone: Math.max(0, customersTotal - (withPhoneCount ?? 0)),
    bookingCount: bookingCount ?? 0,
    publishedCount: publishedCount ?? 0,
    revolutConfigured: revolutConfigured(),
    revolutConnected: revolutIsConnected,
    stripeConfigured: stripeConfigured(),
    stripeWebhookConfigured: stripeWebhookConfigured(),
  });

  return (
    <div className="mt-6 space-y-8">
      <AdminLaunchStatus items={items} />

      <section aria-labelledby="reglages-liens-titre">
        <h2 id="reglages-liens-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          Administration
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {LINKS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="admin-af-card block rounded-2xl p-5 text-[var(--admin-navy)]">
                <span className="font-display text-lg font-bold">{item.title}</span>
                <span className="mt-2 block text-sm text-muted">{item.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
