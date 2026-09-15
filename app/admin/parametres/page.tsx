import { requireStaffPage } from "@/lib/crm/auth";
import { SettingsEditor } from "@/components/admin/SettingsEditor";

export default async function SettingsPage() {
  const { supabase, staff } = await requireStaffPage();
  const { data } = await supabase.from("crm_agency_settings").select("key,value").in("key", ["agency_identity", "email_templates"]);
  const identity = data?.find((row) => row.key === "agency_identity")?.value as Record<string, unknown> | undefined;
  const templates = data?.find((row) => row.key === "email_templates")?.value as Record<string, unknown> | undefined;
  const integrations = [
    { name: "Stripe", ready: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) },
    { name: "Revolut", ready: Boolean(process.env.REVOLUT_CLIENT_ID && process.env.REVOLUT_CLIENT_SECRET) },
    { name: "Resend", ready: Boolean(process.env.RESEND_API_KEY) },
    { name: "mTrip", ready: Boolean(process.env.MTRIP_API_ID && process.env.MTRIP_API_KEY && process.env.MTRIP_ACCOUNT_ID) },
  ];
  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Paramètres</h1><p className="text-sm text-muted">Identité agence et état des intégrations. Aucune valeur secrète n’est affichée.</p></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{integrations.map((integration) => <div key={integration.name} className="admin-af-card p-4"><p className="font-bold">{integration.name}</p><p className={`mt-1 text-xs font-semibold ${integration.ready ? "text-emerald-700" : "text-amber-700"}`}>{integration.ready ? "Configuré" : "Configuration incomplète"}</p></div>)}</section>
      <SettingsEditor initialIdentity={identity || {}} initialTemplates={templates || {}} canEdit={staff.role === "admin"} />
    </div>
  );
}
