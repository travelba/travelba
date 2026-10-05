import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carnetVisible } from "@/lib/crm/carnet";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingDocument, CrmBookingItem } from "@/lib/crm/types";
import { isTripShareCode, publicTripItems, tripShareAllowsPath } from "@/lib/crm/trip-share";

export type PublishedTripShare = {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
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
  const docs = ((docRows || []) as CrmBookingDocument[]).filter(
    (doc) =>
      doc.visible_to_client &&
      Boolean(doc.storage_path) &&
      tripShareAllowsPath(doc.storage_path, booking, [doc])
  );
  return { booking, items: publicTripItems(items), docs };
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
    .select("id, cover_image_path, visible_to_client, share_code, archived_at")
    .eq("share_code", code)
    .maybeSingle();
  if (!data?.visible_to_client || data.archived_at) return false;
  const booking = data as Pick<CrmBooking, "id" | "cover_image_path" | "visible_to_client">;
  const { data: docs } = await admin
    .from("crm_booking_documents")
    .select("storage_path, visible_to_client")
    .eq("booking_id", booking.id)
    .eq("visible_to_client", true);
  return tripShareAllowsPath(path, booking, docs || []);
}
