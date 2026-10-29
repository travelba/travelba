import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UniverseView } from "@/components/vitrine/UniverseView";
import { serviceUniverses } from "@/lib/vitrine/services";
import { universeBySlug } from "@/lib/vitrine/universes";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return serviceUniverses.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const universe = universeBySlug(slug);
  if (!universe) return { title: "Travel BA" };
  return { title: universe.menu, description: universe.lede };
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const universe = serviceUniverses.find((item) => item.slug === slug);
  if (!universe) notFound();
  return <UniverseView universe={universe} />;
}
