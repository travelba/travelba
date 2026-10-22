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
import {
  frenchCancellation,
  frenchCity,
  frenchHotelLine,
  frenchHotelProse,
  hotelTextNeedsModel,
} from "@/lib/crm/hotel-fr";
import { warmHotelFrench } from "@/lib/crm/hotel-fr-translate";
import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";
import { loadLittleEmperorsHotelFile } from "@/lib/crm/little-emperors-search";
import { collapseRooms, type ClientHotelFile, type ClientRate, type ClientRoom } from "@/lib/crm/hotel-journey";

export const runtime = "nodejs";
export const maxDuration = 60;

function clock(value: string) {
  return /^\d{1,2}:\d{2}$/.test(value) ? value : "";
}

function line(value: string) {
  return frenchHotelLine(frenchLeBenefitLine(publicHotelText(value)));
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
  const prose = [
    profile.description,
    profile.funFact,
    ...profile.sections.flatMap((section) => section.lines),
  ].filter(hotelTextNeedsModel);
  await warmHotelFrench(prose);
  const city = frenchCity(profile.location.split(",")[0]?.trim() || parsed.query.city || parsed.query.destination);
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
    const roomName = line(stay.roomLabel || "") || "Séjour";
    const key = stay.roomKey || roomName;
    const rate: ClientRate = {
      offerId,
      room: roomName,
      title: line(stay.rateTitle || "") || "Séjour",
      detail: "",
      cancellation: frenchCancellation(stay.cancellation),
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

  const rooms = collapseRooms([...groups.values()]);
  const file: ClientHotelFile = {
    name,
    city,
    address: publicHotelText(profile.address),
    description: frenchHotelProse(publicHotelText(profile.description)),
    funFact: frenchHotelProse(publicHotelText(profile.funFact)),
    images: profile.images.length ? profile.images : rooms.flatMap((room) => room.images).slice(0, 12),
    amenities: profile.amenities.map((item) => line(item)).filter(Boolean),
    sections: profile.sections.map((section) => ({
      title: line(section.title) || publicHotelText(section.title),
      lines: section.lines.map((item) => frenchHotelProse(publicHotelText(item)) || line(item)).filter(Boolean),
    })),
    benefits: visibleBenefits(profile.benefits.map((item) => line(item))),
    footnotes: profile.footnotes.map((item) => line(item)).filter(Boolean),
    checkInTime: clock(profile.checkInTime),
    checkOutTime: clock(profile.checkOutTime),
    coords: profile.coords,
    rooms,
  };
  return NextResponse.json({ file });
}
