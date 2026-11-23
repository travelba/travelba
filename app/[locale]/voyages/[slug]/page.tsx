import { notFound, redirect } from "next/navigation";
import { signatureSlotFromSlug } from "@/lib/site-offers";

export default async function FormerSignaturePath({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (signatureSlotFromSlug(slug)) {
    redirect(`/${locale}/voyages/signature/${slug}`);
  }
  notFound();
}
