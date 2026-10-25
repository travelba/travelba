import { notFound } from "next/navigation";
import { AgencePreview } from "@/components/admin/AgencePreview";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const metadata = { title: "Agence — exemple", robots: { index: false, follow: false } };

/** Barre de discussions, hors de l’espace client. Fermé en production. Rien n’est écrit. */
export default async function AgenceExemplePage({
  searchParams,
}: {
  searchParams: Promise<{ discussions?: string; fil?: string }>;
}) {
  if (!exampleSessionEnabled()) notFound();
  const params = await searchParams;
  return <AgencePreview discussions={params.discussions || null} fil={params.fil || null} />;
}
