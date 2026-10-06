import { ClientMailCatalog } from "@/components/admin/ClientMailCatalog";
import { clientMailCatalog } from "@/lib/crm/client-mail-catalog";

export default function MailsOutilsPage() {
  return <ClientMailCatalog groups={clientMailCatalog()} />;
}
