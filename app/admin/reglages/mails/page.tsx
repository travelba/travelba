import { ClientMailCatalog } from "@/components/admin/ClientMailCatalog";
import { clientMailCatalog } from "@/lib/crm/client-mail-catalog";

export const metadata = { title: "E-mails au client" };

export default function MailsReglagesPage() {
  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">E-mails au client</h2>
      <p className="mt-1 text-sm text-muted">Aperçu des e-mails. L’exemple Camille et la référence TB-EXEMPLE sont fictifs.</p>
      <ClientMailCatalog groups={clientMailCatalog()} />
    </div>
  );
}
