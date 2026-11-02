import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UniverseView } from "@/components/vitrine/UniverseView";
import { universeBySlug } from "@/lib/vitrine/universes";

const universe = universeBySlug("club");

export const metadata: Metadata = {
  title: "Club Travel BA",
  description: universe?.lede ?? "Le Club Travel BA.",
};

export default function ClubPage() {
  if (!universe) notFound();
  return <UniverseView universe={universe} />;
}
