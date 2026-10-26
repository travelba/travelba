import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UniverseView } from "@/components/vitrine/UniverseView";
import { universeBySlug } from "@/lib/vitrine/universes";

const universe = universeBySlug("professionnels");

export const metadata: Metadata = {
  title: "Déplacements professionnels",
  description: universe?.lede ?? "Déplacements professionnels Travel BA.",
};

export default function ProfessionnelsPage() {
  if (!universe) notFound();
  return <UniverseView universe={universe} />;
}
