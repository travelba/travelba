import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicTripView } from "@/components/crm/PublicTripView";
import { tripHeadline } from "@/lib/crm/carnet";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { formatDateFr } from "@/lib/crm/money";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import { withoutHotelRosterItems } from "@/lib/crm/hotel-contact";
import { headers } from "next/headers";
import { originFromHeaders } from "@/lib/crm/calendar-ics";
import { phoneCalendarMap } from "@/lib/crm/calendar-feed";
import { loadPublishedTripShare } from "@/lib/crm/trip-share-load";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

function tripDescription(start: string | null, end: string | null) {
  const lead = "Itinéraire et documents, préparés par Travel Business Agency.";
  if (!start && !end) return lead;
  return `${formatDateFr(start)} — ${formatDateFr(end)}. ${lead}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const trip = await loadPublishedTripShare(code);
  const hidden = { index: false, follow: false };
  if (!trip) return { title: "Voyage", robots: hidden };
  const title = tripHeadline(trip.booking.title, trip.booking.destination);
  const description = tripDescription(trip.booking.start_date, trip.booking.end_date);
  const cover = bookingCoverUrl(trip.booking, 1200, { partage: code, items: trip.items });
  return {
    title,
    description,
    robots: hidden,
    openGraph: {
      title,
      description,
      url: `${siteConfig.url}/v/${code}`,
      siteName: siteConfig.name,
      images: cover ? [{ url: cover, alt: title }] : undefined,
    },
  };
}

export default async function PublicTripPage({ params }: Props) {
  const { code } = await params;
  const trip = await loadPublishedTripShare(code);
  if (!trip) notFound();
  const items = withoutHotelRosterItems(await loadHotelContacts(trip.booking.id, trip.items));
  const phones = phoneCalendarMap(originFromHeaders(await headers()), trip.booking, items);
  return <PublicTripView booking={trip.booking} items={items} docs={trip.docs} partage={code} phones={phones} />;
}
