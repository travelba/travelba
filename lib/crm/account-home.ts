import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import {
  daysUntil,
  encoursCaption,
  formatDateRangeShort,
  formatMoney,
  isUpcomingBooking,
  jMinusLabel,
  tripDurationDays,
} from "@/lib/crm/money";
import {
  flightCardSubtitle,
  flightCardTitle,
  hotelCityLine,
  hotelDisplayName,
  hotelStayLabel,
  hotelsOf,
  sortItemsByOrder,
} from "@/lib/crm/carnet";

export type HomeHighlight = {
  icon: string;
  label: string;
  title: string;
  detail: string;
};

export type HomeDossierRow = {
  href: string;
  icon: string;
  label: string;
  title: string;
  detail?: string;
  attention?: boolean;
};

export function homeTimingLabel(booking: Pick<CrmBooking, "start_date" | "end_date" | "status">) {
  const countdown = jMinusLabel(booking.start_date);
  if (countdown) return countdown;
  const started = daysUntil(booking.start_date);
  if (
    booking.status === "travelling" ||
    (started != null && started < 0 && isUpcomingBooking(booking.end_date))
  ) {
    return "En cours";
  }
  return null;
}

export function homeDateLabel(booking: Pick<CrmBooking, "start_date" | "end_date">) {
  const range = formatDateRangeShort(booking.start_date, booking.end_date);
  const days = tripDurationDays(booking.start_date, booking.end_date);
  if (!days) return range;
  return `${range} (${days} jour${days > 1 ? "s" : ""})`;
}

function hotelDetail(item: CrmBookingItem) {
  const city = hotelCityLine(item);
  const hasDates = Boolean((item.start_at || "").slice(0, 10) || (item.end_at || "").slice(0, 10));
  const stay = hasDates ? hotelStayLabel(item) : "";
  return [city, stay].filter(Boolean).join(" · ");
}

/** Vol puis hôtel publiés. Pas d’heure inventée, pas de carte masquée. */
export function homeTripHighlights(items: CrmBookingItem[]): HomeHighlight[] {
  const visible = sortItemsByOrder(items.filter((item) => item.visible_to_client !== false));
  const rows: HomeHighlight[] = [];
  const flight = visible.find((item) => item.kind === "flight");
  if (flight) {
    const title = flightCardTitle(flight).trim();
    if (title) {
      rows.push({
        icon: "flight_takeoff",
        label: "Vol",
        title,
        detail: flightCardSubtitle(flight),
      });
    }
  }
  const hotel = hotelsOf(visible)[0];
  if (hotel) {
    const title = hotelDisplayName(hotel).trim();
    if (title) {
      rows.push({
        icon: "hotel",
        label: "Hébergement",
        title,
        detail: hotelDetail(hotel),
      });
    }
  }
  return rows;
}

export function homePassportRow(href: string, ready: number, total: number): HomeDossierRow {
  const missing = Math.max(0, total - ready);
  if (!total) {
    return {
      href,
      icon: "id_card",
      label: "Pièces",
      title: "Voyageurs à compléter",
      detail: "L’agence a besoin des noms pour le dossier.",
    };
  }
  if (!missing) {
    return {
      href,
      icon: "verified",
      label: "Pièces",
      title: total > 1 ? `${total} voyageurs au dossier` : "Pièce au dossier",
    };
  }
  return {
    href,
    icon: "id_card",
    label: "Pièces",
    title: `Manquante pour ${missing} voyageur${missing > 1 ? "s" : ""}`,
    attention: true,
  };
}

export function homeBalanceTitle(rows: { currency: string; value: number }[]) {
  return rows.map((row) => formatMoney(row.value, row.currency)).join(" · ");
}

export function homeBalanceDetail(rows: { currency: string; value: number }[]) {
  if (rows.some((row) => row.value < 0)) return "Reste à régler";
  if (rows.some((row) => row.value > 0)) return "Avoir sur le compte";
  return encoursCaption(0);
}
