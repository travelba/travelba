import { OutilsTabs } from "@/components/admin/OutilsTabs";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export default async function OutilsLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Outils"
        subtitle="Les messages que l’agence envoie au client, l’état de la boîte Gmail, et l’aperçu de l’espace client hors production."
      />
      <OutilsTabs showExample={exampleSessionEnabled()} />
      {children}
    </div>
  );
}
