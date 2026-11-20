import "server-only";

import { littleEmperorsConfigured } from "@/lib/crm/little-emperors";
import { expediaSearchEnabled, safeExpediaConfig } from "@/lib/crm/expedia/config";
import {
  expediaNotOpenBook,
  expediaNotOpenCancel,
  expediaNotOpenPriceCheck,
  littleEmperorsBook,
  littleEmperorsCancel,
  littleEmperorsPriceCheck,
} from "./outcomes";
import type { HotelProvider } from "./types";

const LE_CAPABILITIES: HotelProvider["capabilities"] = {
  suggest: true,
  searchByHotel: true,
  searchByCity: true,
  priceCheck: true,
  bookApi: true,
  cancelApi: false,
  content: true,
  paymentModes: ["client_card_frame", "agency_vcc"],
};

const EXPEDIA_CAPABILITIES: HotelProvider["capabilities"] = {
  suggest: false,
  searchByHotel: true,
  searchByCity: true,
  priceCheck: false,
  bookApi: false,
  cancelApi: false,
  content: true,
  paymentModes: ["supplier_collect", "property_collect"],
};

/** Recherche et réservation Little Emperors. Réserver renvoie les mêmes issues que le port actuel. */
export function littleEmperorsHotelProvider(): HotelProvider {
  return {
    id: "little_emperors",
    capabilities: LE_CAPABILITIES,
    configured: () => littleEmperorsConfigured(),
    priceCheck(input, nowIso) {
      return littleEmperorsPriceCheck(littleEmperorsConfigured(), input, nowIso);
    },
    book(input) {
      return littleEmperorsBook(littleEmperorsConfigured(), input);
    },
    cancel(input) {
      return littleEmperorsCancel(littleEmperorsConfigured(), input);
    },
  };
}

/** Lecture seule. Réserver, vérifier le prix et annuler restent fermés. */
export function expediaHotelProvider(): HotelProvider {
  return {
    id: "expedia",
    capabilities: EXPEDIA_CAPABILITIES,
    configured: () => expediaSearchEnabled() && Boolean(safeExpediaConfig()?.apiKey),
    priceCheck() {
      return expediaNotOpenPriceCheck();
    },
    book() {
      return expediaNotOpenBook();
    },
    cancel() {
      return expediaNotOpenCancel();
    },
  };
}

export function activeHotelProviders(): HotelProvider[] {
  const providers: HotelProvider[] = [];
  const little = littleEmperorsHotelProvider();
  if (little.configured()) providers.push(little);
  const expedia = expediaHotelProvider();
  if (expedia.configured()) providers.push(expedia);
  return providers;
}
