import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import {
  LittleEmperorsError,
  getHotelDetails,
} from "@/lib/little-emperors/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const hotelId = Number(id);
  if (!Number.isFinite(hotelId)) {
    return jsonError("hotel id invalide");
  }

  try {
    const hotel = await getHotelDetails(hotelId);
    return NextResponse.json({ hotel });
  } catch (error) {
    if (error instanceof LittleEmperorsError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}
