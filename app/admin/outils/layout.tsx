import { OutilsTabs } from "@/components/admin/OutilsTabs";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";

export default async function OutilsLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Outils"
        subtitle="Les messages que l’agence envoie au client, relus tels qu’ils partent."
      />
      <OutilsTabs />
      {children}
    </div>
  );
}
