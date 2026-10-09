import Link from "next/link";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";

const LINKS = [
  { href: "/admin/outils/whatsapp", title: "Messages types WhatsApp", text: "Textes prêts à envoyer au client." },
  { href: "/admin/outils/mails", title: "E-mails au client", text: "Aperçu des e-mails de l’espace client." },
  { href: "/admin/outils/gmail", title: "Diagnostic Gmail", text: "Accès à la boîte agence, sans lire la file." },
];

export const metadata = { title: "Outils" };

export default async function OutilsPage() {
  await requireStaffPage();
  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Outils" subtitle="Messages, e-mails au client et diagnostic de la boîte." />
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {LINKS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="admin-af-card block rounded-2xl p-5 text-[var(--admin-navy)]">
              <span className="font-display text-lg font-bold">{item.title}</span>
              <span className="mt-2 block text-sm text-muted">{item.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
