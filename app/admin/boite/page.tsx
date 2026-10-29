import { FournisseursPanel } from "@/components/admin/boite/FournisseursPanel";
import { HotelsPanel } from "@/components/admin/boite/HotelsPanel";
import { WhatsappPanel } from "@/components/admin/boite/WhatsappPanel";
import { TabLinks } from "@/components/admin/TabLinks";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { adminBadges } from "@/lib/crm/admin-badges";
import type { SearchParamValue } from "@/lib/crm/admin-list";
import { requireStaffPage } from "@/lib/crm/auth";
import { BOITE_TAB_HELP, BOITE_TAB_IDS, BOITE_TAB_LABELS, boiteHref, boiteTabFromParam } from "@/lib/crm/boite-tabs";

export const metadata = { title: "Boîte de réception" };

/** Boîte de réception : Fournisseurs, Hôtels, WhatsApp. Un onglet par file ; les anciennes pages redirigent ici. */
export default async function BoitePage({ searchParams }: { searchParams: Promise<Record<string, SearchParamValue>> }) {
  const [{ supabase }, params, badges] = await Promise.all([requireStaffPage(), searchParams, adminBadges()]);
  const tab = boiteTabFromParam(params.onglet);
  const counts = { fournisseurs: badges.emails + badges.le, hotels: badges.hotels, whatsapp: badges.whatsapp };

  return (
    <div className="min-w-0">
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Boîte de réception" subtitle={BOITE_TAB_HELP[tab]} />
      <TabLinks
        ariaLabel="Onglets de la Boîte de réception"
        active={tab}
        tabs={BOITE_TAB_IDS.map((id) => ({ id, href: boiteHref(id), label: BOITE_TAB_LABELS[id], count: counts[id] }))}
      />
      <h2 className="sr-only">{BOITE_TAB_LABELS[tab]}</h2>
      <div className="mt-6">
        {tab === "fournisseurs" ? (
          <FournisseursPanel supabase={supabase} params={params} />
        ) : tab === "hotels" ? (
          <HotelsPanel supabase={supabase} params={params} counts={{ reponses: badges.hotels }} />
        ) : (
          <WhatsappPanel params={params} />
        )}
      </div>
    </div>
  );
}
