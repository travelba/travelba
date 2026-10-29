import { WhatsappCatalog } from "@/components/admin/WhatsappCatalog";
import { whatsappCatalog } from "@/lib/crm/whatsapp-catalog";

export const metadata = { title: "Modèles WhatsApp" };

export default function WhatsappReglagesPage() {
  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Modèles WhatsApp</h2>
      <p className="mt-1 text-sm text-muted">Textes prêts pour le client. L’exemple Camille et la référence TB-EXEMPLE sont fictifs.</p>
      <WhatsappCatalog groups={whatsappCatalog()} />
    </div>
  );
}
