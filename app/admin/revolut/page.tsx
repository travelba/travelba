import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export default async function AdminRevolutPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireStaffPage();
  const params = await searchParams;
  const initialMessage =
    params.error === "oauth"
      ? "Connexion Revolut refusée ou expirée. Relancez « Connecter Revolut »."
      : params.connected === "1"
        ? "Compte Revolut connecté. Les virements sans ambiguïté seront crédités automatiquement."
        : null;
  const admin = createServiceClient();
  const { data: customers } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name, company_name, email, phone")
    .order("last_name");

  let rows: CrmRevolutTransaction[] = [];
  try {
    const { data } = await admin
      .from("crm_revolut_transactions")
      .select("*")
      .eq("direction", "credit")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    rows = (data || []) as CrmRevolutTransaction[];
  } catch {
    rows = [];
  }

  const hasClientId = Boolean(process.env.REVOLUT_CLIENT_ID?.trim());

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Rapprochement Revolut"
        subtitle="Virements reçus sur le compte Business. Proposition de client pré-sélectionnée : Valider ou Refuser."
      />
      <div className="mt-6">
        <RevolutInbox
          rows={rows}
          customers={(customers || []) as PickableCustomer[]}
          configured={revolutConfigured()}
          connected={await revolutConnected()}
          hasClientId={hasClientId}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
