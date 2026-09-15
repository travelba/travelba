import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import {
  checkTripIdentifier,
  deleteTrips,
  MtripError,
  upsertTrip,
} from "@/lib/mtrip/client";
import type { MtripTrip } from "@/lib/mtrip/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  const identifier = new URL(request.url).searchParams.get("identifier")?.trim();
  if (!identifier) {
    return jsonError("Paramètre identifier requis");
  }

  try {
    const data = await checkTripIdentifier(identifier);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MtripError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  let trip: MtripTrip;
  try {
    trip = (await request.json()) as MtripTrip;
  } catch {
    return jsonError("JSON invalide");
  }

  if (!trip?.start_date || !trip?.end_date) {
    return jsonError("start_date et end_date sont requis");
  }
  if (!Array.isArray(trip.destinations) || trip.destinations.length === 0) {
    return jsonError("Au moins une destination est requise");
  }
  if (!Array.isArray(trip.travelers) || trip.travelers.length === 0) {
    return jsonError("Au moins un traveler est requis");
  }

  try {
    const data = await upsertTrip(trip);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof MtripError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  let body: { identifiers?: string[] };
  try {
    body = (await request.json()) as { identifiers?: string[] };
  } catch {
    return jsonError("JSON invalide");
  }

  const identifiers = body.identifiers?.filter(Boolean) ?? [];
  if (identifiers.length === 0) {
    return jsonError("identifiers[] requis");
  }

  try {
    const data = await deleteTrips(identifiers);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof MtripError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}
