import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UniverseView } from "@/components/vitrine/UniverseView";
import { universeBySlug } from "@/lib/vitrine/universes";

const universe = universeBySlug("seminaires");

export const metadata: Metadata = {
  title: "Séminaires et événements privés",
  description: universe?.lede ?? "Séminaires et événements privés Travel BA.",
};

export default function SeminairesPage() {
  if (!universe) notFound();
  return <UniverseView universe={universe} />;
}
