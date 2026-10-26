import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OfferView } from "@/components/preview-refonte/OfferView";
import { offerBySlug, offers } from "@/components/preview-refonte/offers";

const staticSlugs = new Set(["kids", "entre-nous", "celebrer", "montagne"]);

const aliases: Record<string, string> = {
  ski: "/preview-refonte/montagne",
  prestige: "/preview-refonte/celebrer",
};

type Props = { params: Promise<{ service: string }> };

export function generateStaticParams() {
  return [
    ...offers.filter((offer) => !staticSlugs.has(offer.slug)).map((offer) => ({ service: offer.slug })),
    ...Object.keys(aliases).map((service) => ({ service })),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service } = await params;
  const offer = offerBySlug(service);
  if (!offer) return { title: "Travel BA" };
  return { title: offer.menu, description: `${offer.lede} Étude non indexée.` };
}

export default async function PreviewServicePage({ params }: Props) {
  const { service } = await params;
  if (aliases[service]) redirect(aliases[service]);
  if (!offerBySlug(service) || staticSlugs.has(service)) notFound();
  return <OfferView slug={service} />;
}
