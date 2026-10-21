import { agencyEmailHtml } from "@/lib/crm/email-html";
import { applyCancellationToBooking } from "@/lib/crm/ingest-booking";
import { emptyBookingExtract } from "@/lib/crm/ingest-types";
import {
  CLIENT_CANCEL_CARD_LAG,
  CLIENT_CANCEL_NOT_SENT,
  CLIENT_CANCEL_REFUSED,
  clientCancelTrace,
  decideClientLeCancel,
  type LeCancelRow,
} from "@/lib/crm/le-free-cancel";
import { cancelLittleEmperorsBooking, listLittleEmperorsBookings, type LeBooking } from "@/lib/crm/little-emperors";
import { deliverServiceRequestMail, type ServiceRequestMail } from "@/lib/crm/service-request-mail";
import { siteConfig } from "@/lib/site";
import type { CrmBookingItem } from "@/lib/crm/types";

export type ClientLeCancelDeps = {
  now: Date;
  loadRows: () => Promise<LeCancelRow[]>;
  listBookings: () => Promise<LeBooking[]>;
  deleteBooking: (leBookingId: number) => Promise<void>;
  cancelCard: () => Promise<void>;
  appendTrace: (note: string) => Promise<void>;
  markCancelled: (rowId: string, lastError: string | null) => Promise<void>;
  notifyAgency: (facts: {
    hotelName: string;
    stayLabel: string;
    untilLabel: string;
    cardUpdated: boolean;
  }) => Promise<void>;
};

export type ClientLeCancelResult = { ok: true; sent: true } | { ok: false; sent: boolean; message: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildClientLeCancelMail(input: {
  to: string;
  reference: string;
  bookingId: string;
  holderName: string;
  hotelName: string;
  stayLabel: string;
  untilLabel: string;
  cardUpdated: boolean;
}): ServiceRequestMail | null {
  const to = oneLine(input.to);
  if (!to) return null;
  const hotel = oneLine(input.hotelName) || "Hôtel";
  const stay = oneLine(input.stayLabel);
  const until = oneLine(input.untilLabel);
  const holder = oneLine(input.holderName) || "Client";
  const reference = oneLine(input.reference);
  const href = /^[0-9a-f-]{36}$/i.test(input.bookingId)
    ? `${siteConfig.url}/admin/reservations/${input.bookingId}`
    : `${siteConfig.url}/admin/reservations`;
  const subject = oneLine(`Annulation gratuite · ${hotel} · ${reference}`).slice(0, 180);
  const lag = input.cardUpdated
    ? ""
    : "La réservation est annulée chez Little Emperors. La carte du dossier n’a pas pu être mise à jour.";
  const rows = [
    ["Client", holder],
    ["Hôtel", hotel],
    ["Dates", stay],
    ["Jusqu’au", until],
  ];
  const text = [
    "Le client a annulé une réservation d’hôtel, sans frais.",
    ...rows.map(([label, value]) => `${label} : ${value}`),
    lag,
    href,
  ]
    .filter(Boolean)
    .join("\n");
  const body = rows
    .map(
      ([label, value]) =>
        `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;">${escapeHtml(label)} : ${escapeHtml(value)}</p>`
    )
    .join("");
  const html = agencyEmailHtml({
    title: "Annulation gratuite",
    preheader: `${hotel} · ${reference}`,
    bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Le client a annulé une réservation d’hôtel, sans frais.</p>${body}${
      lag ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.5;">${escapeHtml(lag)}</p>` : ""
    }`,
    ctaLabel: "Ouvrir le dossier",
    ctaHref: href,
  });
  return { to, subject, html, text };
}

/**
 * Relit la liste Little Emperors, puis DELETE seulement si c’est encore gratuit.
 * La carte, la ligne et l’alerte ne bougent qu’après ce DELETE.
 */
export async function runClientLeCancel(
  input: { item: CrmBookingItem; hotels: CrmBookingItem[] },
  deps: ClientLeCancelDeps
): Promise<ClientLeCancelResult> {
  let rows: LeCancelRow[];
  try {
    rows = await deps.loadRows();
  } catch {
    return { ok: false, sent: false, message: CLIENT_CANCEL_NOT_SENT };
  }
  let fresh: LeBooking[];
  try {
    fresh = await deps.listBookings();
  } catch {
    return { ok: false, sent: false, message: CLIENT_CANCEL_NOT_SENT };
  }
  const decision = decideClientLeCancel({
    item: input.item,
    hotels: input.hotels,
    rows,
    fresh,
    now: deps.now,
  });
  if (!decision.ok) return { ok: false, sent: false, message: CLIENT_CANCEL_REFUSED };
  try {
    await deps.deleteBooking(decision.leBookingId);
  } catch {
    return { ok: false, sent: false, message: CLIENT_CANCEL_NOT_SENT };
  }
  let cardUpdated = false;
  try {
    await deps.cancelCard();
    cardUpdated = true;
  } catch {
    cardUpdated = false;
  }
  const note = clientCancelTrace(decision.hotelName, decision.stayLabel, decision.untilLabel);
  try {
    await deps.appendTrace(note);
  } catch {
    // La trace ne doit pas faire croire que l’hôtel a refusé.
  }
  try {
    await deps.markCancelled(
      decision.rowId,
      cardUpdated ? null : "Annulation envoyée à Little Emperors. La carte du dossier n’a pas été mise à jour."
    );
  } catch {
    // La ligne sera reprise au prochain passage. Le DELETE a déjà eu lieu.
  }
  try {
    await deps.notifyAgency({
      hotelName: decision.hotelName,
      stayLabel: decision.stayLabel,
      untilLabel: decision.untilLabel,
      cardUpdated,
    });
  } catch {
    // L’alerte manquée ne revient pas sur l’annulation.
  }
  if (!cardUpdated) return { ok: false, sent: true, message: CLIENT_CANCEL_CARD_LAG };
  return { ok: true, sent: true };
}

export async function cancelClientLeHotel(input: {
  bookingId: string;
  customerId: string;
  visibleToClient: boolean;
  item: CrmBookingItem;
  hotels: CrmBookingItem[];
  now?: Date;
  listBookings?: () => Promise<LeBooking[]>;
  deleteBooking?: (leBookingId: number) => Promise<void>;
  notifyAgency?: ClientLeCancelDeps["notifyAgency"];
}) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  return runClientLeCancel(
    { item: input.item, hotels: input.hotels },
    {
      now: input.now || new Date(),
      loadRows: async () => {
        const { data, error } = await admin
          .from("crm_le_bookings")
          .select(
            "id, le_booking_id, confirmation_number, hotel_id, hotel_name, check_in, check_out, state, is_cancellable, cancellation_deadline, cancellation_policies, status"
          )
          .eq("crm_booking_id", input.bookingId);
        if (error) throw new Error(error.message || "lecture");
        return ((data || []) as LeCancelRow[]).map((row) => ({
          ...row,
          le_booking_id: Number(row.le_booking_id),
          cancellation_policies: Array.isArray(row.cancellation_policies) ? row.cancellation_policies : [],
        }));
      },
      listBookings: input.listBookings || (() => listLittleEmperorsBookings()),
      deleteBooking: input.deleteBooking || ((id) => cancelLittleEmperorsBooking(id)),
      cancelCard: async () => {
        const extract = emptyBookingExtract();
        extract.items = [
          {
            kind: "hotel",
            title: input.item.title,
            supplier: input.item.supplier,
            confirmation_ref: input.item.confirmation_ref,
            start_at: input.item.start_at,
            end_at: input.item.end_at,
            amount: null,
            include_in_ledger: false,
            details: input.item.details || {},
          },
        ];
        await applyCancellationToBooking({
          bookingId: input.bookingId,
          customerId: input.customerId,
          extract,
          visibleToClient: input.visibleToClient,
          itemId: input.item.id,
        });
      },
      appendTrace: async (note) => {
        const { data } = await admin.from("crm_bookings").select("notes_internal").eq("id", input.bookingId).maybeSingle();
        const previous = String(data?.notes_internal || "").trim();
        if (previous.includes(note)) return;
        const { error } = await admin
          .from("crm_bookings")
          .update({ notes_internal: previous ? `${previous}\n${note}` : note })
          .eq("id", input.bookingId);
        if (error) throw new Error(error.message || "trace");
      },
      markCancelled: async (rowId, lastError) => {
        const { error } = await admin
          .from("crm_le_bookings")
          .update({
            state: "cancelled",
            is_cancellable: false,
            last_event: "client_cancel",
            last_error: lastError,
          })
          .eq("id", rowId)
          .eq("crm_booking_id", input.bookingId);
        if (error) throw new Error(error.message || "ligne");
      },
      notifyAgency:
        input.notifyAgency ||
        (async (facts) => {
          const to = (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
          const { data } = await admin
            .from("crm_bookings")
            .select("reference")
            .eq("id", input.bookingId)
            .maybeSingle();
          const { data: customer } = await admin
            .from("crm_customers")
            .select("first_name, last_name")
            .eq("id", input.customerId)
            .maybeSingle();
          const mail = buildClientLeCancelMail({
            to,
            reference: String(data?.reference || ""),
            bookingId: input.bookingId,
            holderName: [customer?.first_name, customer?.last_name].filter(Boolean).join(" "),
            hotelName: facts.hotelName,
            stayLabel: facts.stayLabel,
            untilLabel: facts.untilLabel,
            cardUpdated: facts.cardUpdated,
          });
          if (!mail) return;
          await deliverServiceRequestMail(mail);
        }),
    }
  );
}
