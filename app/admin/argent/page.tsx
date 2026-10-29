import { ArgentTabs } from "@/components/admin/argent/ArgentTabs";
import { ComptesPanel } from "@/components/admin/argent/ComptesPanel";
import { EncaisserPanel } from "@/components/admin/argent/EncaisserPanel";
import { GrandLivrePanel } from "@/components/admin/argent/GrandLivrePanel";
import { PointerPanel } from "@/components/admin/argent/PointerPanel";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { adminBadges } from "@/lib/crm/admin-badges";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";
import { ARGENT_TAB_HELP, ARGENT_TAB_LABELS, argentTabFromParam } from "@/lib/crm/argent-tabs";
import { requireStaffPage } from "@/lib/crm/auth";

export const metadata = { title: "Argent" };

/** Argent : À encaisser, À pointer, Grand livre, Comptes. Un onglet par geste ; les anciennes pages redirigent ici. */
export default async function ArgentPage({ searchParams }: { searchParams: Promise<Record<string, SearchParamValue>> }) {
  const [{ supabase }, params, badges] = await Promise.all([requireStaffPage(), searchParams, adminBadges()]);
  const tab = argentTabFromParam(params.onglet);

  return (
    <div className="min-w-0">
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Argent" subtitle={ARGENT_TAB_HELP[tab]} />
      <ArgentTabs active={tab} counts={{ "a-encaisser": badges.revolut + badges.stripe, "a-pointer": badges.costs }} />
      <h2 className="sr-only">{ARGENT_TAB_LABELS[tab]}</h2>
      <div className="mt-6">
        {tab === "a-encaisser" ? (
          <EncaisserPanel
            clientId={firstParam(params.client) || null}
            connectedParam={firstParam(params.connected) || null}
            errorParam={firstParam(params.error) || null}
          />
        ) : tab === "a-pointer" ? (
          <PointerPanel params={params} />
        ) : tab === "grand-livre" ? (
          <GrandLivrePanel supabase={supabase} />
        ) : (
          <ComptesPanel />
        )}
      </div>
    </div>
  );
}
