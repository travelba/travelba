import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { publicCoverPath, toCoverJpeg } from "@/lib/crm/cover-file";
import { catalogCachePath, isCatalogPhotoId } from "@/lib/crm/cover-retouch";
import { unsplashKeywordMatch } from "@/lib/crm/covers";
import { downloadCrmFile } from "@/lib/crm/files";
import { isBookingReference } from "@/lib/crm/concierge-notices";

type Ctx = { params: Promise<{ reference: string }> };

/**
 * JPEG de la couverture déjà publiée.
 * Twilio / WhatsApp récupère cette URL en HTTPS, sans jeton Supabase.
 * Un brouillon répond 404.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { reference } = await ctx.params;
  if (!isBookingReference(reference)) return new NextResponse(null, { status: 404 });

  let booking: { destination: string | null; title: string | null; cover_image_path: string | null } | null =
    null;
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_bookings")
      .select("destination, title, cover_image_path")
      .eq("reference", reference)
      .eq("visible_to_client", true)
      .maybeSingle();
    booking = data;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!booking) return new NextResponse(null, { status: 404 });

  let bytes: Buffer | null = null;
  if (booking.cover_image_path) {
    try {
      const file = await downloadCrmFile(booking.cover_image_path);
      bytes = Buffer.from(file.bytes);
    } catch {
      bytes = null;
    }
  }
  if (!bytes) {
    const photo = unsplashKeywordMatch({
      destination: booking.destination,
      title: booking.title || "",
    });
    if (photo && isCatalogPhotoId(photo)) {
      try {
        const file = await downloadCrmFile(catalogCachePath(photo));
        bytes = Buffer.from(file.bytes);
      } catch {
        bytes = null;
      }
      if (!bytes) {
        try {
          bytes = await readFile(publicCoverPath(photo));
        } catch {
          bytes = null;
        }
      }
    }
  }
  if (!bytes?.byteLength) return new NextResponse(null, { status: 404 });

  const jpeg = await toCoverJpeg(bytes);
  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
