import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { publicCoverPath, toCoverJpeg } from "@/lib/crm/cover-file";
import { catalogCachePath, isCatalogPhotoId } from "@/lib/crm/cover-retouch";
import { unsplashKeywordMatch } from "@/lib/crm/covers";
import { downloadCrmFile } from "@/lib/crm/files";
import { isBookingReference } from "@/lib/crm/concierge-notices";
import { entryCoverAllowed, isEntryCode } from "@/lib/crm/entry-link";
import { isTripShareCode } from "@/lib/crm/trip-share";

type Ctx = { params: Promise<{ reference: string }> };

type CoverBooking = { destination: string | null; title: string | null; cover_image_path: string | null };

/**
 * JPEG de la couverture déjà publiée.
 * Twilio / WhatsApp récupère cette URL en HTTPS, sans jeton Supabase.
 * L’adresse porte une preuve d’accès, sinon les références séquentielles TB-AAAA-NNNN
 * seraient énumérables (B-14) :
 * - `?e=CODE` : le code d’un lien court vivant, « Votre séjour », qui pointe sur ce dossier
 *   (aperçu /e/, modèle WhatsApp du séjour). Jamais le code de partage dans une page rendue.
 * - `?partage=CODE` : le code /v/CODE, pour les médias Twilio seulement (réponse du Concierge).
 * Un brouillon, un dossier archivé, un lien mort ou un code absent / différent répondent 404.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { reference } = await ctx.params;
  if (!isBookingReference(reference)) return new NextResponse(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const entry = (params.get("e") || "").trim().toUpperCase();
  const partage = params.get("partage") || "";
  if (!isEntryCode(entry) && !isTripShareCode(partage)) return new NextResponse(null, { status: 404 });

  let booking: CoverBooking | null = null;
  try {
    const admin = createServiceClient();
    if (isEntryCode(entry)) {
      const { data: link } = await admin.from("crm_entry_links").select("*").eq("code", entry).maybeSingle();
      if (!entryCoverAllowed({ link, reference, now: new Date() })) return new NextResponse(null, { status: 404 });
      const { data } = await admin
        .from("crm_bookings")
        .select("destination, title, cover_image_path")
        .eq("reference", reference)
        .eq("visible_to_client", true)
        .is("archived_at", null)
        .maybeSingle();
      booking = data;
    } else {
      const { data } = await admin
        .from("crm_bookings")
        .select("destination, title, cover_image_path")
        .eq("reference", reference)
        .eq("share_code", partage)
        .eq("visible_to_client", true)
        .is("archived_at", null)
        .maybeSingle();
      booking = data;
    }
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
