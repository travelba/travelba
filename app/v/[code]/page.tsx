import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicTripView } from "@/components/crm/PublicTripView";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import { loadPublishedTripShare } from "@/lib/crm/trip-share-load";
import { publicTripMetadata, publicTripPageModel, publishedTripForCode } from "@/lib/crm/trip-share-example";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const trip = await publishedTripForCode(code, loadPublishedTripShare);
  return publicTripMetadata(code, trip);
}

export default async function PublicTripPage({ params }: Props) {
  const { code } = await params;
  const model = await publicTripPageModel(code, {
    loadTrip: loadPublishedTripShare,
    loadContacts: loadHotelContacts,
  });
  if (!model) notFound();
  return (
    <PublicTripView
      booking={model.booking}
      items={model.items}
      docs={model.docs}
      partage={code}
      phones={model.phones}
    />
  );
}
