import { WhatsappCatalog } from "@/components/admin/WhatsappCatalog";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { whatsappCatalog } from "@/lib/crm/whatsapp-catalog";

export const metadata = { title: "Messages types WhatsApp" };

export default function WhatsappOutilsPage() {
  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Messages types WhatsApp"
        subtitle="Textes prêts pour le client. L’exemple Camille et la référence TB-EXEMPLE sont fictifs."
      />
      <WhatsappCatalog groups={whatsappCatalog()} />
    </div>
  );
}
