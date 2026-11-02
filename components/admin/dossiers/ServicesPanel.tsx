import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceDesk } from "@/components/admin/ServiceDesk";
import { EmptyState } from "@/components/crm/ui";
import { loadAgencyServiceDesk } from "@/lib/crm/service-desk-load";

/** Vue Services à confirmer de Dossiers : chauffeur, accueil et enregistrement encore ouverts. */
export async function ServicesPanel({ supabase }: { supabase: SupabaseClient }) {
  const lines = await loadAgencyServiceDesk(supabase);
  if (!lines.length) {
    return <EmptyState title="Aucun service à confirmer" description="Les demandes encore ouvertes apparaîtront ici." />;
  }
  return <ServiceDesk lines={lines} />;
}
