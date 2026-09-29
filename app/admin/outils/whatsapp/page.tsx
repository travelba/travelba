import { WhatsappCatalog } from "@/components/admin/WhatsappCatalog";
import { whatsappCatalog } from "@/lib/crm/whatsapp-catalog";

export default function WhatsappOutilsPage() {
  return <WhatsappCatalog groups={whatsappCatalog()} />;
}
