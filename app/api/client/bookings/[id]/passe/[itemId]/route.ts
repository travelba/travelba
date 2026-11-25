import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadClientStay } from "@/lib/crm/client-stay-load";
import { clientVisibleItems, carnetVisible } from "@/lib/crm/carnet";
import { ticketTravelerNames } from "@/lib/crm/document-passengers";
import { buildItemPass, flightHasAirlinePass, itemEligible, type WalletDocRef } from "@/lib/crm/wallet-pass";
import { walletPassImages } from "@/lib/crm/wallet-images";
import { packPass, walletSigningMaterial } from "@/lib/crm/wallet-sign";
import { customerFullName, type CrmBookingItem, type CrmBookingTraveler } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

function guestOf(item: CrmBookingItem, travelers: CrmBookingTraveler[], fallback: string) {
  const tickets = ticketTravelerNames(item.details);
  if (tickets.length) return tickets.slice(0, 4).join(", ");
  const people = travelers
    .map((row) => [row.first_name, row.last_name].filter(Boolean).join(" ").trim())
    .filter(Boolean);
  if (people.length) return people.slice(0, 4).join(", ");
  return fallback === "Client" ? null : fallback;
}

/** Passe TBA (hôtel, transfert, vol de repli). 404 si la signature n’est pas posée. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const material = walletSigningMaterial();
  if (!material) return jsonError("Carte introuvable", 404);
  const { id: reference, itemId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return jsonError("Carte introuvable", 404);
  const loaded = await loadClientStay(reference);
  const booking = loaded.booking;
  if (!booking || !loaded.customer) return jsonError("Carte introuvable", 404);

  const [{ data: itemRows }, { data: docRows }, { data: travelerRows }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("*").eq("booking_id", booking.id),
    auth.supabase
      .from("crm_booking_documents")
      .select("booking_item_id, file_name, mime_type")
      .eq("booking_id", booking.id)
      .eq("visible_to_client", true),
    auth.supabase.from("crm_booking_travelers").select("first_name, last_name").eq("booking_id", booking.id),
  ]);
  const docs = (docRows || []) as WalletDocRef[];
  const items = clientVisibleItems((itemRows || []) as CrmBookingItem[]);
  if (!carnetVisible(booking, items)) return jsonError("Carte introuvable", 404);
  const item = items.find((row) => row.id === itemId);
  if (!item || !itemEligible(item)) return jsonError("Carte introuvable", 404);
  if (item.kind === "flight" && flightHasAirlinePass(item, docs)) return jsonError("Carte introuvable", 404);

  const built = buildItemPass(
    item,
    guestOf(item, (travelerRows || []) as CrmBookingTraveler[], customerFullName(loaded.customer)),
    { passTypeId: material.passTypeId, teamId: material.teamId, bookingId: booking.id }
  );
  if (!built) return jsonError("Carte introuvable", 404);
  try {
    const bytes = packPass(built.pass, await walletPassImages(), material);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": 'attachment; filename="tba.pkpass"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[wallet]", error instanceof Error ? error.message.slice(0, 120) : "signature");
    return jsonError("La carte n’a pas pu être préparée.", 500);
  }
}
