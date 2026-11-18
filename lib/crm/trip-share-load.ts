import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { piecesActives } from "@/lib/crm/dossier-piece";
import { carnetVisible } from "@/lib/crm/carnet";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingDocument, CrmBookingItem } from "@/lib/crm/types";
import { isTripShareCode, publicTripItems, tripShareAllowsPath } from "@/lib/crm/trip-share";
import { isClientInvoiceDocument, stripClientMoneyItem } from "@/lib/crm/client-price-privacy";
import { customerHidesPrices } from "@/lib/crm/client-price-privacy-load";

export type PublishedTripShare = {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
  hidePrices?: boolean;
};

export const loadPublishedTripShare = cache(async (code: string): Promise<PublishedTripShare | null> => {
  if (!isTripShareCode(code)) return null;
  let admin: SupabaseClient;
  try {
    admin = createServiceClient();
  } catch {
    return null;
  }
  const { data } = await admin.from("crm_bookings").select("*").eq("share_code", code).maybeSingle();
  if (!data) return null;
  const booking = data as CrmBooking;
  if (!booking.visible_to_client || booking.archived_at) return null;
  const [{ data: itemRows }, { data: docRows }] = await Promise.all([
    admin.from("crm_booking_items").select("*").eq("booking_id", booking.id).order("sort_order"),
    admin
      .from("crm_booking_documents")
      .select("*")
      .eq("booking_id", booking.id)
      .eq("visible_to_client", true),
  ]);
  const items = (itemRows || []) as CrmBookingItem[];
  if (!carnetVisible(booking, items)) return null;
  const hidePrices = await customerHidesPrices(booking.customer_id);
  const docs = piecesActives((docRows || []) as CrmBookingDocument[])
    .filter(
      (doc) =>
        doc.visible_to_client &&
        Boolean(doc.storage_path) &&
        tripShareAllowsPath(doc.storage_path, booking, [doc])
    )
    .filter((doc) => (hidePrices ? !isClientInvoiceDocument(doc) : true));
  const shared = publicTripItems(items);
  return {
    booking,
    items: hidePrices ? shared.map((item) => stripClientMoneyItem(item)) : shared,
    docs,
    hidePrices,
  };
});

export { ensureTripShareCode } from "./trip-share-code";

export async function sharePathAllowed(code: string, path: string) {
  if (!isTripShareCode(code)) return false;
  let admin: SupabaseClient;
  try {
    admin = createServiceClient();
  } catch {
    return false;
  }
  const { data } = await admin
    .from("crm_bookings")
    .select("id, customer_id, cover_image_path, visible_to_client, share_code, archived_at")
    .eq("share_code", code)
    .maybeSingle();
  if (!data?.visible_to_client || data.archived_at) return false;
  const booking = data as Pick<CrmBooking, "id" | "cover_image_path" | "visible_to_client">;
  const { data: docs } = await admin
    .from("crm_booking_documents")
    .select("storage_path, visible_to_client, kind, file_name")
    .eq("booking_id", booking.id)
    .eq("visible_to_client", true);
  const hidePrices = await customerHidesPrices((data as { customer_id?: string }).customer_id || "");
  const visible = ((docs || []) as { storage_path?: string | null; visible_to_client?: boolean | null; kind?: string | null; file_name?: string | null }[]).filter(
    (doc) => (hidePrices ? !isClientInvoiceDocument(doc) : true)
  );
  if (hidePrices && isClientInvoiceDocument({ storage_path: path, file_name: path.split("/").pop() || "" })) return false;
  return tripShareAllowsPath(path, booking, visible);
}
