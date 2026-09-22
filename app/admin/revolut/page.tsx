import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export default async function AdminRevolutPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { supabase } = await requireStaffPage();
  const params = await searchParams;
  const initialMessage =
    params.error === "oauth"
      ? "Connexion Revolut refusée ou expirée. Relancez « Connecter Revolut »."
      : params.connected === "1"
        ? "Compte Revolut connecté."
        : null;
  const { data: customers } = await supabase
    .from("crm_customers")
    .select("*")
    .order("last_name");

  let rows: CrmRevolutTransaction[] = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_revolut_transactions")
      .select("*")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    rows = (data || []) as CrmRevolutTransaction[];
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Rapprochement Revolut"
        subtitle="Connecter le compte Business une fois, puis rapprocher à la main. Aucun crédit client n’est automatique."
      />
      <div className="mt-6">
        <RevolutInbox
          rows={rows}
          customers={(customers || []) as CrmCustomer[]}
          configured={revolutConfigured()}
          connected={await revolutConnected()}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
