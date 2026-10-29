import { TabLinks } from "@/components/admin/TabLinks";
import { ARGENT_TAB_IDS, ARGENT_TAB_LABELS, argentHref, type ArgentTab } from "@/lib/crm/argent-tabs";

/** Onglets Argent : la pastille porte le nombre de gestes en attente. */
export function ArgentTabs({ active, counts }: { active: ArgentTab; counts: Partial<Record<ArgentTab, number>> }) {
  return (
    <TabLinks
      ariaLabel="Onglets Argent"
      active={active}
      tabs={ARGENT_TAB_IDS.map((tab) => ({ id: tab, href: argentHref(tab), label: ARGENT_TAB_LABELS[tab], count: counts[tab] }))}
    />
  );
}
