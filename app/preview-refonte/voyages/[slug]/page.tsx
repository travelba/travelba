import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DestinationView } from "@/components/vitrine/DestinationView";
import { destinationBySlug, destinations } from "@/lib/vitrine/destinations";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return destinations.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const destination = destinationBySlug(slug);
  const trip = destination?.itineraries[0];
  if (!destination || !trip) return { title: "Voyage" };
  return {
    title: `${destination.name} — ${trip.title}`,
    description: `${trip.duration}. ${destination.line}`,
  };
}

export default async function VoyagePage({ params }: Props) {
  const { slug } = await params;
  const destination = destinationBySlug(slug);
  if (!destination) notFound();
  return <DestinationView destination={destination} />;
}
