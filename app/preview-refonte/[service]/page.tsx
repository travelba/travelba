import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { previewServices, serviceBySlug } from "@/components/preview-refonte/catalog";
import { ServiceView } from "@/components/preview-refonte/ServiceView";

type Props = { params: Promise<{ service: string }> };

export function generateStaticParams() {
  return previewServices.map((service) => ({ service: service.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) return { title: "Travel BA" };
  return {
    title: service.menu,
    description: `${service.description} Étude non indexée.`,
  };
}

export default async function PreviewServicePage({ params }: Props) {
  const { service: slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();
  return <ServiceView service={service} />;
}
