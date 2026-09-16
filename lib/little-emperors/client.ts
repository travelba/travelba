import type {
  AvailabilityRequest,
  Booking,
  CreateBookingRequest,
  HotelAvailability,
  HotelDetails,
  PredictiveSearchItem,
} from "./types";

export class LittleEmperorsError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "LittleEmperorsError";
    this.status = status;
    this.body = body;
  }
}

function getConfig() {
  const baseUrl =
    process.env.LITTLE_EMPERORS_API_URL ||
    "https://api-staging.littleemperors.com/v2";
  const apiKey = process.env.LITTLE_EMPERORS_API_KEY;

  if (!apiKey) {
    throw new LittleEmperorsError(
      "LITTLE_EMPERORS_API_KEY manquante. Ajoutez-la dans .env.local.",
      500
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export function getWidgetBaseUrl() {
  return (
    process.env.LITTLE_EMPERORS_WIDGET_URL ||
    "https://api-staging.littleemperors.com"
  ).replace(/\/$/, "");
}

async function leFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> }
): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = new URL(`${baseUrl}${path}`);

  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const { query: _query, ...rest } = init || {};
  void _query;
  const response = await fetch(url.toString(), {
    ...rest,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(rest.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Little Emperors API error (${response.status})`;
    throw new LittleEmperorsError(message, response.status, body);
  }

  return body as T;
}

export async function predictiveSearch(
  query: string,
  limit = 20,
  types?: string[]
) {
  const { baseUrl, apiKey } = getConfig();
  const endpoint = new URL(`${baseUrl}/search`);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("limit", String(limit));
  if (types?.length) {
    for (const type of types) {
      endpoint.searchParams.append("types[]", type);
    }
  }

  const response = await fetch(endpoint.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LittleEmperorsError(
      "Recherche Little Emperors impossible",
      response.status,
      body
    );
  }

  return body as PredictiveSearchItem[];
}

export async function getHotelAvailability(payload: AvailabilityRequest) {
  return leFetch<HotelAvailability[]>("/hotels/availability", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getHotelDetails(hotelId: number) {
  return leFetch<HotelDetails>(`/hotels/${hotelId}`);
}

export async function createHotelBooking(payload: CreateBookingRequest) {
  return leFetch<Booking>("/hotels/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getHotelBooking(bookingId: number) {
  return leFetch<Booking>(`/hotels/bookings/${bookingId}`);
}

export async function listHotelBookings(params?: {
  hotel_id?: number;
  start_date?: string;
  end_date?: string;
}) {
  return leFetch<Booking[]>("/hotels/bookings", {
    method: "GET",
    query: params,
  });
}
