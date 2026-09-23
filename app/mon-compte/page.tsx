import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  type CrmBalance,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateRangeShort, isUpcomingBooking } from "@/lib/crm/money";
import { isCompanyMember } from "@/lib/crm/company-role";
import { loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { tripHeadline, tripPlaceLine } from "@/lib/crm/carnet";
import { greetingGivenName } from "@/lib/crm/identity";
import {
  homeBalanceDetail,
  homeBalanceTitle,
  homeDateLabel,
  homePassportRow,
  homeTimingLabel,
  homeTripHighlights,
  type HomeDossierRow,
  type HomeHighlight,
} from "@/lib/crm/account-home";
import { AccountHome } from "@/components/account/AccountHome";

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const member = isCompanyMember(customer);
  await reconcileCustomerParty(customer.id);
  const [{ data: balances }, bookings] = await Promise.all([
    member
      ? Promise.resolve({ data: [] as CrmBalance[] })
      : supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    loadVisibleCarnets(supabase, customer.id),
  ]);

  const upcoming = sortBookingsByStart(
    bookings.filter((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"),
    "asc"
  );
  const nextTrip = upcoming[0] || null;

  let coverage = { ready: 0, total: 0 };
  let highlights: HomeHighlight[] = [];
  if (nextTrip) {
    const [{ data: travelers }, { data: identityDocs }, { data: itemRows }] = await Promise.all([
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", nextTrip.id),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
      supabase.from("crm_booking_items").select("*").eq("booking_id", nextTrip.id),
    ]);
    coverage = tripDocCoverage(
      (travelers || []) as CrmBookingTraveler[],
      (identityDocs || []) as CrmTravelDocument[]
    );
    highlights = homeTripHighlights((itemRows || []) as CrmBookingItem[]);
  }

  const balanceRows = ((balances || []) as CrmBalance[]).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shownBalances = balanceRows.length ? balanceRows : [{ currency: "EUR", value: 0 }];
  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  const tripHref = nextTrip
    ? `/mon-compte/reservations/${nextTrip.reference}`
    : "/mon-compte/reservations";

  const dossier: HomeDossierRow[] = [];
  if (nextTrip) {
    dossier.push(
      homePassportRow(
        coverage.total > coverage.ready ? `${tripHref}#passeport` : "/mon-compte/profil/documents",
        coverage.ready,
        coverage.total
      )
    );
  }
  if (member) {
    dossier.push({
      href: "/mon-compte/transactions",
      icon: "receipt_long",
      label: "Frais",
      title: "Vos dossiers société",
      detail: "Les versements société ne sont pas affichés ici.",
    });
  } else {
    dossier.push({
      href: "/mon-compte/transactions",
      icon: "account_balance_wallet",
      label: "Compte",
      title: homeBalanceTitle(shownBalances),
      detail: homeBalanceDetail(shownBalances),
      attention: shownBalances.some((row) => row.value < 0),
    });
  }

  const notes = nextTrip?.notes_client?.trim() || null;

  return (
    <AccountHome
      firstName={firstName}
      trip={
        nextTrip
          ? {
              booking: nextTrip,
              href: tripHref,
              name: tripHeadline(nextTrip.title, nextTrip.destination, "Prochain séjour"),
              place: tripPlaceLine(nextTrip.title, nextTrip.destination),
              dates: homeDateLabel(nextTrip),
              timing: homeTimingLabel(nextTrip),
              statusLabel: BOOKING_STATUS_LABELS[nextTrip.status],
              reference: nextTrip.reference,
              notes,
              highlights,
            }
          : null
      }
      dossier={dossier}
      others={upcoming.slice(1, 4).map((booking) => ({
        href: `/mon-compte/reservations/${booking.reference}`,
        dates: formatDateRangeShort(booking.start_date, booking.end_date),
        name: tripHeadline(booking.title, booking.destination, "Séjour"),
        place: tripPlaceLine(booking.title, booking.destination),
      }))}
    />
  );
}
