import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { NotificationsManager } from "@/components/account/NotificationsManager";
import type { CrmNotification } from "@/lib/crm/types";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/mon-compte/notifications");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");
  const [{ data: notifications }, { data: preferences }] = await Promise.all([
    supabase.from("crm_notifications").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }),
    supabase.from("crm_notification_preferences").select("*").eq("customer_id", customer.id).maybeSingle(),
  ]);
  return (
    <div className="space-y-5">
      <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">Centre d’alertes</p><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Notifications</h1></header>
      <NotificationsManager
        customerId={customer.id}
        initialNotifications={(notifications || []) as CrmNotification[]}
        initialPreferences={{
          email_travel: preferences?.email_travel ?? true,
          email_payment: preferences?.email_payment ?? true,
          email_documents: preferences?.email_documents ?? true,
          whatsapp_operational: preferences?.whatsapp_operational ?? false,
        }}
      />
    </div>
  );
}
