import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UniverseView } from "@/components/vitrine/UniverseView";
import { universeBySlug } from "@/lib/vitrine/universes";

const universe = universeBySlug("sur-mesure");

export const metadata: Metadata = {
  title: "Voyages sur mesure",
  description: universe?.lede ?? "Voyages sur mesure Travel BA.",
};

export default function SurMesurePage() {
  if (!universe) notFound();
  return <UniverseView universe={universe} />;
}
