import { randomBytes } from "crypto";
import { buildBestTrip } from "./build-trip";
import {
  checkTripIdentifier,
  getMobileAppLink,
  MtripError,
  upsertTrip,
} from "./client";
import type { AgencyMtripGuide, MtripGuidePassenger } from "./guide-types";
import { buildVoyageTitleFromGuide } from "./voyage-title";
import {
  findLeHotelByName,
  frenchAgencyHotelHtml,
  hotelMatchesTripContext,
  resolveLeHotelById,
  upsertHotelInventory,
} from "./le-hotel-media";
import {
  buildActivitiesFromQuoteLines,
  buildDestinations,
  buildFlightsFromGuide,
  buildPricesFromQuoteLines,
  hotelStaysFromGuide,
  inferTripDestinationContext,
  tripDescriptionHtml,
} from "./map-guide-to-trip";
import type {
  MtripAccommodation,
  MtripDestination,
  MtripTraveler,
} from "./types";

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function toIsoDate(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? `${m[1]}T12:00:00` : fallback;
  }
  return d.toISOString().slice(0, 19);
}

/** FR 07… → +337… for mTrip / WhatsApp consistency */
function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `33${digits.slice(1)}`;
  }
  return `+${digits}`;
}

function validLocation(location: { latitude: number; longitude: number } | undefined) {
  return Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      location.longitude >= -180 &&
      location.longitude <= 180 &&
      (Math.abs(location.latitude) > 0.0001 ||
        Math.abs(location.longitude) > 0.0001)
  );
}

export function validatePublicationGeo(
  destinations: MtripDestination[],
  accommodations: MtripAccommodation[]
) {
  const errors: string[] = [];
  destinations.forEach((destination, index) => {
    if (!/^[A-Z]{2}$/.test(destination.country_iso_code || "")) {
      errors.push(`Destination ${index + 1} : code pays ISO manquant ou invalide.`);
    }
    if (!validLocation(destination.location)) {
      errors.push(`Destination ${index + 1} : coordonnées géographiques requises.`);
    }
  });
  accommodations.forEach((accommodation, index) => {
    if (!accommodation.inventory_id || !validLocation(accommodation.location)) {
      errors.push(
        `Hôtel ${index + 1} : établissement et coordonnées doivent être validés dans l’inventaire.`
      );
    }
  });
  return errors;
}

/**
 * mTrip refuse silencieusement un 2e voyage si le même email voyageur
 * est déjà utilisé (répond « updated » mais le trip n’existe pas).
 * On scope l’identifiant de connexion par guide via +alias.
 */
export function mtripScopedEmail(
  email: string | null | undefined,
  guideId: string
): string | undefined {
  if (!email?.includes("@")) return undefined;
  const [local, domain] = email.split("@");
  if (!local || !domain) return undefined;
  const tag = guideId.replace(/-/g, "").slice(0, 8);
  const baseLocal = local.split("+")[0];
  return `${baseLocal}+tba${tag}@${domain}`;
}

/**
 * Publication « MAX mTrip » :
 * - inventories LE (jusqu’à 5 photos / hôtel)
 * - cover trip + destinations
 * - vols depuis extraction / devis
 * - prix, activités/transferts, sort_items_by_position
 */
export async function publishGuideToMtrip(guide: AgencyMtripGuide) {
  if (!guide.passengers?.length) {
    throw new Error("Ajoutez au moins un passager avant publication.");
  }

  const voyageTitle = buildVoyageTitleFromGuide(guide);
  const identifier =
    guide.mtrip_identifier ||
    `guide-${slugify(voyageTitle) || "voyage"}-${guide.id.slice(0, 8)}`;

  const start =
    guide.start_date ||
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const end =
    guide.end_date ||
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  if (new Date(`${start}T00:00:00`).getTime() > new Date(`${end}T23:59:00`).getTime()) {
    throw new Error("La date de fin du voyage doit suivre la date de début.");
  }

  const travelers: MtripTraveler[] = guide.passengers.map(
    (p: MtripGuidePassenger, index: number) => {
      const loginEmail = mtripScopedEmail(p.email, guide.id);
      return {
        identifier: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: loginEmail,
        phone: normalizePhone(p.phone) || undefined,
        language: p.language || "fr",
        role:
          p.role === "lead_traveler" || index === 0
            ? ["lead_traveler", "traveler"]
            : ["traveler"],
        password: randomBytes(9).toString("base64url"),
        // Invitations via WhatsApp CRM — pas d’email mTrip (alias)
        send_invitation_type: 0,
        send_invitation_sms: false,
      };
    }
  );

  const flights = buildFlightsFromGuide(guide, travelers, start, end);
  const destCtx = inferTripDestinationContext(guide, flights);
  const stays = hotelStaysFromGuide(guide);

  const accommodations: MtripAccommodation[] = [];
  const hotelMeta: Array<{
    name: string;
    city?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    cover?: string;
    lat?: number;
    lng?: number;
    country?: string;
  }> = [];
  let tripCover: string | undefined;

  for (let index = 0; index < stays.length; index++) {
    const h = stays[index];
    let leHotel = null as Awaited<ReturnType<typeof findLeHotelByName>>;
    if (h.le_hotel_id) {
      leHotel = await resolveLeHotelById(h.le_hotel_id, destCtx);
    }
    if (!leHotel) {
      leHotel = await findLeHotelByName(h.name, destCtx);
    }
    // Double-check : ne jamais publier un LE hors destination
    if (leHotel && !hotelMatchesTripContext(leHotel, destCtx)) {
      console.warn(
        "[mtrip] dropping LE enrich for stay (context mismatch):",
        h.name,
        leHotel.name,
        leHotel.location
      );
      leHotel = null;
    }

    const city =
      h.city ||
      destCtx.city ||
      (flights[0]?.arrival_city as string | undefined) ||
      guide.title;

    let inventoryId: string | undefined;
    let photos: string[] = [];
    let info = `<p>Réservation confirmée${
      h.booking_reference
        ? ` — réf. <strong>${h.booking_reference}</strong>`
        : ""
    }${city ? ` à <strong>${city}</strong>` : ""}.</p>`;

    if (leHotel) {
      try {
        const inv = await upsertHotelInventory({
          guideId: guide.id,
          hotelName: h.name,
          leHotel,
          city,
          bookingRef: h.booking_reference,
        });
        inventoryId = inv.inventoryId;
        photos = inv.photos;
        if (inv.cover && !tripCover) tripCover = inv.cover;
        info = frenchAgencyHotelHtml(leHotel, city, h.booking_reference);
      } catch (err) {
        console.warn("[mtrip] inventory upsert failed:", h.name, err);
      }
    }

    // Nom CRM prioritaire ; LE seulement si validé geo
    const displayName = leHotel?.name || h.name;
    const useLeGeo = Boolean(leHotel);

    accommodations.push({
      identifier: `hotel-${index + 1}`,
      name: displayName,
      booking_number: h.booking_reference || undefined,
      from_date: toIsoDate(h.check_in, `${start}T15:00:00`),
      to_date: toIsoDate(h.check_out, `${end}T12:00:00`),
      check_in_time: "15:00",
      check_out_time: "12:00",
      city,
      address: useLeGeo ? leHotel?.address : undefined,
      phone: useLeGeo ? leHotel?.phone : undefined,
      email: useLeGeo ? leHotel?.email : undefined,
      website: useLeGeo ? leHotel?.website : undefined,
      picture_url: photos[0],
      inventory_id: inventoryId,
      info,
      location:
        useLeGeo &&
        leHotel?.latitude != null &&
        leHotel?.longitude != null
          ? {
              latitude: leHotel.latitude,
              longitude: leHotel.longitude,
            }
          : undefined,
      country_code: destCtx.country,
      position: index + 1,
      active_for_every_traveler: true,
      travelers_details: travelers
        .map((t) => t.identifier)
        .filter(Boolean)
        .map((id) => ({
          traveler_identifier: id as string,
          booking_number: h.booking_reference || undefined,
        })),
    });

    hotelMeta.push({
      name: displayName,
      city,
      check_in: h.check_in,
      check_out: h.check_out,
      cover: photos[0],
      lat: useLeGeo ? leHotel?.latitude : destCtx.lat,
      lng: useLeGeo ? leHotel?.longitude : destCtx.lng,
      country: destCtx.country,
    });
  }

  const destinations = buildDestinations({
    title: voyageTitle,
    tripStart: start,
    tripEnd: end,
    hotels: hotelMeta,
    flights,
    coverUrl: tripCover,
  });
  const geoErrors = validatePublicationGeo(destinations, accommodations);
  if (geoErrors.length) {
    throw new Error(`Publication mTrip bloquée : ${geoErrors.join(" ")}`);
  }

  // Cover trip = 1re photo hôtel ou destination
  if (!tripCover) {
    tripCover =
      destinations.find((d) => d.picture_url)?.picture_url ||
      accommodations.find((a) => a.picture_url)?.picture_url;
  }

  const { prices, total, currency } = buildPricesFromQuoteLines(
    guide.quote_lines
  );
  const activities = buildActivitiesFromQuoteLines(guide.quote_lines, start);

  const trip = buildBestTrip({
    identifier,
    name: voyageTitle,
    startDate: `${start}T00:00:00`,
    endDate: `${end}T23:59:00`,
    description: tripDescriptionHtml(guide, guide.passengers),
    pictureUrl: tripCover,
    destinations,
    travelers,
    flights: flights.length ? flights : undefined,
    accommodations: accommodations.length ? accommodations : undefined,
    activities: activities.length ? activities : undefined,
    prices: prices.length ? prices : undefined,
    totalPrice: total > 0 ? total : undefined,
    priceCurrency: currency,
    priceNote:
      total > 0
        ? "Montants indicatifs issus du devis agence Travelba."
        : undefined,
    accountId: guide.mtrip_account_id,
    draft: false,
    sortItemsByPosition: true,
  });

  // Les signed URL Supabase dépassent la limite MySQL mTrip sur `documents.url`
  // → on n’envoie que des URL courtes ; les PJ restent dans le CRM / devis WhatsApp.
  const MAX_MTRIP_DOC_URL = 255;
  const docs = (guide.documents || [])
    .map((d) => {
      const url = (d as { signed_url?: string | null }).signed_url;
      if (!url || url.length > MAX_MTRIP_DOC_URL) return null;
      return {
        url: String(url),
        name: d.file_name,
        description: "Document de confirmation",
        travelers: travelers.map((t) => t.identifier!).filter(Boolean),
      };
    })
    .filter(Boolean) as NonNullable<
    Parameters<typeof buildBestTrip>[0]["documents"]
  >;
  if (docs.length) trip.documents = docs;

  await upsertTrip(trip);

  // mTrip peut répondre 200/201 alors que le trip n’est pas créé (ex. email déjà pris)
  try {
    await checkTripIdentifier(identifier);
  } catch (err) {
    throw new MtripError(
      "mTrip a accepté la requête mais le voyage est introuvable. Réessayez ou changez l’email voyageur.",
      err instanceof MtripError ? err.status : 502,
      err instanceof MtripError ? err.body : undefined
    );
  }

  const app_links: Record<string, string> = {};
  for (const t of travelers) {
    if (!t.identifier) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
      try {
        const link = await getMobileAppLink({
          user_identifier: t.identifier,
          trip_identifier: identifier,
        });
        const url =
          (link as { mobile_app_link?: string }).mobile_app_link ||
          (link as { url?: string }).url;
        if (url) {
          app_links[t.identifier] = url;
          break;
        }
      } catch {
        // retry
      }
    }
  }

  return {
    identifier,
    title: voyageTitle,
    payload: trip,
    app_links,
    travelers: travelers.map((t) => ({
      identifier: t.identifier,
      password: t.password,
      email: t.email,
    })),
    enrichment: {
      hotels_with_inventory: accommodations.filter((a) => a.inventory_id)
        .length,
      flights: flights.length,
      destinations: destinations.length,
      photos: accommodations.reduce(
        (n, a) => n + (a.picture_url ? 1 : 0),
        0
      ),
      cover: Boolean(tripCover),
    },
  };
}
