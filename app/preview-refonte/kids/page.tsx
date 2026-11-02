import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UniverseView } from "@/components/vitrine/UniverseView";
import { universeBySlug } from "@/lib/vitrine/universes";

const universe = universeBySlug("kids");

export const metadata: Metadata = {
  title: "Kids",
  description: universe?.lede ?? "L’univers Kids Travel BA.",
};

export default function KidsPage() {
  if (!universe) notFound();
  return <UniverseView universe={universe} />;
}
