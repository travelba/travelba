import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { clientStayFace } from "@/lib/crm/client-stay-face";
import { isClientUpcomingStay } from "@/lib/crm/client-stays";
import { clientBookingScope } from "@/lib/crm/company-peers";
import { destinationWeather } from "@/lib/crm/destination-weather";
import { stayToday } from "@/lib/crm/stay-moment";
import type { CrmBookingItem, CrmCustomer } from "@/lib/crm/types";
import { buildWidgetSnapshot, tripWidgetHref, type WidgetSnapshot } from "@/lib/crm/widget-snapshot";

/**
 * Résumé du prochain séjour visible, pour les widgets.
 * Même séjour que l’accueil. Pas de prix, pas de pièce.
 */
export async function loadClientWidgetSnapshot(auth: {
  supabase: SupabaseClient;
  customer: CrmCustomer;
  now?: Date;
}): Promise<WidgetSnapshot> {
  const now = auth.now || new Date();
  const today = stayToday(now);
  const scope = await clientBookingScope(auth.customer);
  const bookings = await loadVisibleCarnets(
    auth.supabase,
    auth.customer.id,
    [...scope.ownerIds],
    [...scope.travelerBookingIds]
  );
  const next =
    sortBookingsByStart(
      bookings.filter((booking) => isClientUpcomingStay(booking)),
      "asc"
    )[0] || null;
  if (!next) {
    return buildWidgetSnapshot({ now, today, stay: null, weather: null });
  }

  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .select("id, booking_id, kind, title, supplier, start_at, end_at, sort_order, details, visible_to_client, lifecycle")
    .eq("booking_id", next.id)
    .order("sort_order");
  if (error) throw new Error("widgets");
  const items = (data || []) as CrmBookingItem[];
  const face = clientStayFace({
    title: next.title,
    destination: next.destination,
    startDate: next.start_date,
    endDate: next.end_date,
    items,
    homeCity: auth.customer.city,
    fallback: "Prochain séjour",
  });
  const place = (face.places[0] || "").trim();
  const weather = place.length >= 2 ? await destinationWeather(place, null) : null;

  return buildWidgetSnapshot({
    now,
    today,
    stay: {
      title: face.title || "Prochain séjour",
      startDate: face.start || next.start_date,
      endDate: face.end || next.end_date,
      href: tripWidgetHref(next.reference),
      items,
    },
    weather: weather
      ? { place, tempC: weather.tempC, label: weather.label, icon: weather.icon }
      : null,
  });
}
