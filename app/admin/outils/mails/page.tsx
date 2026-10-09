import { ClientMailCatalog } from "@/components/admin/ClientMailCatalog";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { clientMailCatalog } from "@/lib/crm/client-mail-catalog";

export const metadata = { title: "E-mails au client" };

export default function MailsOutilsPage() {
  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="E-mails au client"
        subtitle="Aperçu des e-mails. L’exemple Camille et la référence TB-EXEMPLE sont fictifs."
      />
      <ClientMailCatalog groups={clientMailCatalog()} />
    </div>
  );
}
