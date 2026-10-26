import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

const destinations: Record<string, string> = {
  "jet-prive": "/preview-refonte#tenir",
  chauffeur: "/preview-refonte#tenir",
  "accueil-vip": "/preview-refonte#tenir",
  seminaires: "/preview-refonte/entreprise",
  evenements: "/preview-refonte/entreprise",
  prestige: "/preview-refonte/celebrer",
  clubs: "/preview-refonte/celebrer",
  hotels: "/preview-refonte/entre-nous",
  restaurants: "/preview-refonte/entre-nous",
  "sur-mesure": "/preview-refonte/entre-nous",
  ski: "/preview-refonte/montagne",
};

type Props = { params: Promise<{ service: string }> };

export function generateStaticParams() {
  return Object.keys(destinations).map((service) => ({ service }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service } = await params;
  if (!destinations[service]) return { title: "Travel BA" };
  return { title: "Travel BA" };
}

export default async function PreviewServiceRedirect({ params }: Props) {
  const { service } = await params;
  const to = destinations[service];
  if (!to) notFound();
  redirect(to);
}
