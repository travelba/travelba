import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import {
  LittleEmperorsError,
  getHotelAvailability,
} from "@/lib/little-emperors/client";

export const runtime = "nodejs";

const schema = z
  .object({
    start_date: z.string().min(8),
    end_date: z.string().min(8),
    currency: z.string().default("EUR"),
    hotel_id: z.number().int().positive().nullable().optional(),
    location_id: z.number().int().positive().nullable().optional(),
    inspiration_id: z.number().int().positive().nullable().optional(),
    rooms: z
      .array(
        z.object({
          adults: z.number().int().min(1),
          children: z
            .array(z.object({ age: z.number().int().min(0).max(17) }))
            .nullable()
            .optional(),
        })
      )
      .min(1),
  })
  .refine(
    (data) => {
      const ids = [data.hotel_id, data.location_id, data.inspiration_id].filter(
        (v) => v != null
      );
      return ids.length === 1;
    },
    { message: "Fournir exactement un de hotel_id, location_id ou inspiration_id" }
  );

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("Payload invalide");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  try {
    const hotels = await getHotelAvailability(parsed.data);
    return NextResponse.json({ hotels });
  } catch (error) {
    if (error instanceof LittleEmperorsError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}
