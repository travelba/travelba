import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { parisTodayIso } from "@/lib/crm/dates";
import {
  hotelSearchAllowed,
  parseHotelSearchQuery,
  perNightCents,
  priceStayOffer,
  publicHotelText,
  visibleBenefits,
} from "@/lib/crm/hotel-search";
import { saveHotelOffer } from "@/lib/crm/hotel-search-store";
import { loadLittleEmperorsHotelFile } from "@/lib/crm/little-emperors-search";
import type { ClientHotelFile, ClientRate, ClientRoom } from "@/lib/crm/hotel-journey";

export const runtime = "nodejs";
export const maxDuration = 60;

function clock(value: string) {
  return /^\d{1,2}:\d{2}$/.test(value) ? value : "";
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelSearchAllowed(auth.customer)) return jsonError("Introuvable", 404);
  const body = await request.json().catch(() => null);
  const hotelId = Number(body && typeof body === "object" ? (body as { hotelId?: unknown }).hotelId : NaN);
  if (!Number.isInteger(hotelId) || hotelId < 1) return jsonError("Cet hôtel n’est pas disponible.", 400);
  const parsed = parseHotelSearchQuery(body, parisTodayIso());
  if (!parsed.ok) return jsonError(parsed.message, 400);

  const loaded = await loadLittleEmperorsHotelFile({
    hotelId,
    checkIn: parsed.query.checkIn,
    checkOut: parsed.query.checkOut,
    rooms: parsed.query.rooms,
    fetchImpl: fetch,
  });
  if (!loaded) return jsonError("La fiche n’a pas abouti. Réessayez.", 503);

  const profile = loaded.profile;
  const city = profile.location.split(",")[0]?.trim() || parsed.query.city || parsed.query.destination;
  const name = profile.name || parsed.query.destination;
  const groups = new Map<string, ClientRoom>();

  for (const offer of loaded.offers) {
    const stay = priceStayOffer({
      ...offer,
      hotelName: offer.hotelName || name,
      city: offer.city || city,
      hotelId,
    });
    if (!stay) continue;
    const offerId = await saveHotelOffer(auth.customer.id, parsed.query, parsed.nights, stay);
    const roomName = stay.roomLabel || "Séjour";
    const key = stay.roomKey || roomName;
    const rate: ClientRate = {
      offerId,
      room: roomName,
      title: stay.rateTitle || "Tarif du séjour",
      detail: "",
      cancellation: stay.cancellation,
      benefits: stay.benefits,
      footnotes: stay.footnotes,
      perks: stay.perks,
      sellCents: stay.sellCents,
      perNightCents: perNightCents(stay.sellCents, parsed.nights),
      currency: stay.currency,
      images: stay.images,
    };
    const current = groups.get(key) || {
      name: roomName,
      detail: "",
      images: stay.images,
      rates: [] as ClientRate[],
    };
    current.rates.push(rate);
    if (!current.images.length) current.images = stay.images;
    groups.set(key, current);
  }

  const rooms = [...groups.values()].map((room) => ({
    ...room,
    rates: room.rates.sort((a, b) => a.sellCents - b.sellCents),
  }));
  const file: ClientHotelFile = {
    name,
    city,
    address: publicHotelText(profile.address),
    description: publicHotelText(profile.description),
    funFact: publicHotelText(profile.funFact),
    images: profile.images.length ? profile.images : rooms.flatMap((room) => room.images).slice(0, 12),
    amenities: profile.amenities.map((line) => publicHotelText(line)).filter(Boolean),
    sections: profile.sections.map((section) => ({
      title: publicHotelText(section.title),
      lines: section.lines.map((line) => publicHotelText(line)).filter(Boolean),
    })),
    benefits: visibleBenefits(profile.benefits),
    footnotes: profile.footnotes.map((line) => publicHotelText(line)).filter(Boolean),
    checkInTime: clock(profile.checkInTime),
    checkOutTime: clock(profile.checkOutTime),
    coords: profile.coords,
    rooms,
  };
  return NextResponse.json({ file });
}
