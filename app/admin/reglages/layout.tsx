import { ReglagesTabs } from "@/components/admin/ReglagesTabs";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export default async function ReglagesLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaffPage();

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Réglages"
        subtitle="La mise en service, les messages et les e-mails que le client reçoit, l’accès Hôtels et l’état de la boîte Gmail."
      />
      <ReglagesTabs admin={staff.role === "admin"} showExample={exampleSessionEnabled()} />
      {children}
    </div>
  );
}
