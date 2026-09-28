import type { SupabaseClient } from "@supabase/supabase-js";
import { clientVisibleItems, nextTimelineFlight, whatsappModifyHref } from "./carnet";
import { loadStayArrivalPlaces, loadVisibleCarnets, sortBookingsByStart } from "./carnet-query";
import { loadClientLedger } from "./client-ledger";
import { destinationWeather } from "./destination-weather";
import {
  espaceBalances,
  espaceHomeFlight,
  espaceMemberFlag,
  espaceTimelineCards,
  espaceTripCard,
  espaceWhatsappHref,
  resolveEspaceMedia,
  serializeFlightPass,
  splitEspaceBookings,
} from "./espace-payload";
import { espaceCalendarEvents, espaceLiveActivity, espaceWalletPass, espaceWidgetSnapshot } from "./espace-native";
import { greetingGivenName } from "./identity";
import { isUpcomingBooking } from "./money";
import { siteConfig } from "../site";
import type { CrmBalance, CrmBooking, CrmBookingItem, CrmCustomer } from "./types";

export async function loadEspaceHome(supabase: SupabaseClient, customer: CrmCustomer) {
  const member = espaceMemberFlag(customer);
  const [{ data: balances }, bookings] = await Promise.all([
    member
      ? Promise.resolve({ data: [] as CrmBalance[] })
      : supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    loadVisibleCarnets(supabase, customer.id),
  ]);
  const nextTrip =
    sortBookingsByStart(
      bookings.filter((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"),
      "asc"
    )[0] || null;
  const places = nextTrip ? await loadStayArrivalPlaces(supabase, [nextTrip.id]) : {};
  let items: CrmBookingItem[] = [];
  if (nextTrip) {
    const { data: tripItems } = await supabase
      .from("crm_booking_items")
      .select("*")
      .eq("booking_id", nextTrip.id)
      .order("sort_order");
    items = (tripItems || []) as CrmBookingItem[];
  }
  const weather = nextTrip ? await destinationWeather(nextTrip.destination, nextTrip.title) : null;
  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  return {
    customer: {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      email: customer.email,
      needs_phone: !customer.phone,
    },
    greeting: firstName,
    member,
    balances: espaceBalances((balances || []) as CrmBalance[], member),
    nextTrip: nextTrip
      ? {
          ...espaceTripCard(nextTrip, places[nextTrip.id]),
          cover: await resolveEspaceMedia(espaceTripCard(nextTrip, places[nextTrip.id]).cover),
        }
      : null,
    homeFlight: serializeFlightPass(espaceHomeFlight(items)),
    weather,
    widget: espaceWidgetSnapshot({ firstName, booking: nextTrip, items }),
    liveActivity: nextTrip ? espaceLiveActivity({ booking: nextTrip, items }) : null,
    whatsapp: espaceWhatsappHref(),
  };
}

export async function loadEspaceBookings(supabase: SupabaseClient, customer: CrmCustomer) {
  const all = await loadVisibleCarnets(supabase, customer.id);
  const places = await loadStayArrivalPlaces(
    supabase,
    all.map((row) => row.id)
  );
  const { upcoming, past } = splitEspaceBookings(all);
  return {
    upcoming: await Promise.all(
      upcoming.map(async (row) => {
        const card = espaceTripCard(row, places[row.id]);
        return { ...card, cover: await resolveEspaceMedia(card.cover) };
      })
    ),
    past: await Promise.all(
      past.map(async (row) => {
        const card = espaceTripCard(row, places[row.id]);
        return { ...card, cover: await resolveEspaceMedia(card.cover) };
      })
    ),
  };
}

export async function loadEspaceBooking(
  supabase: SupabaseClient,
  customer: CrmCustomer,
  reference: string
) {
  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return null;
  const b = booking as CrmBooking;
  const [{ data: items }, { data: docs }] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", b.id).order("sort_order"),
    supabase.from("crm_booking_documents").select("*").eq("booking_id", b.id).eq("visible_to_client", true),
  ]);
  const list = (items || []) as CrmBookingItem[];
  const places = await loadStayArrivalPlaces(supabase, [b.id]);
  const visible = clientVisibleItems(list);
  return {
    trip: {
      ...espaceTripCard(b, places[b.id]),
      cover: await resolveEspaceMedia(espaceTripCard(b, places[b.id]).cover),
    },
    timeline: espaceTimelineCards(list),
    flight: serializeFlightPass(nextTimelineFlight(visible)),
    documents: (docs || []).map((doc: { id: string; file_name?: string | null; storage_path?: string | null }) => ({
      id: doc.id,
      name: doc.file_name || "Document",
      path: doc.storage_path || null,
    })),
    calendar: espaceCalendarEvents(b, visible),
    wallet: visible
      .map((item) => espaceWalletPass(b, item))
      .filter((pass): pass is NonNullable<typeof pass> => Boolean(pass)),
    modify: whatsappModifyHref(siteConfig.whatsappNumber, b.reference, b.destination),
  };
}

export async function loadEspaceTransactions(supabase: SupabaseClient, customer: CrmCustomer) {
  const view = await loadClientLedger(supabase, customer, "client");
  return {
    member: view.member,
    currency: view.currency,
    balanceValue: view.balanceValue,
    remaining: view.remaining,
    movements: view.movements,
  };
}
