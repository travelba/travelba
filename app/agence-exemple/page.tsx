import { notFound } from "next/navigation";
import { AgencePreview } from "@/components/admin/AgencePreview";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const metadata = { title: "Agence — exemple", robots: { index: false, follow: false } };

/** Même écran que l’agence, hors de l’espace client. Fermé en production. Rien n’est écrit. */
export default function AgenceExemplePage() {
  if (!exampleSessionEnabled()) notFound();
  return <AgencePreview />;
}
