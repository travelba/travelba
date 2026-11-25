import "server-only";

import { cache } from "react";
import {
  boardingOfferForDocument,
  mergeBoardingOffers,
  withWalletPasses,
  type BoardingDocRef,
  type BoardingFlightRef,
  type ClientBoardingOffer,
} from "./client-boarding-pass";
import type { BoardingTravelerName } from "./boarding-pass-groups";
import { pieceEstRetiree } from "./dossier-piece";
import { queryWithOptionalColumn } from "./optional-column";
import { isWalletPassName } from "./pkpass";
import { clientMayReadBooking } from "./company-role";
import { clientBookingScope } from "./company-peers";
import type { CrmCustomer } from "./types";
import { boardingPassPageTexts, readBoardingPassPages } from "./boarding-pass-pdf";
import { isBoardingPassFile } from "./boarding-pass-whatsapp";
import { downloadCrmFile } from "./files";
import { viewsFromContext, loadCheckinContext } from "./online-checkin-db";
import { createServiceClient } from "@/lib/supabase/admin";

const KINDS = ["carte d'embarquement", "carte d’embarquement"];

/**
 * Cartes d’embarquement du dossier, y compris déposées cachées.
 * L’appelant a déjà vérifié que le séjour est celui du client. Les autres pièces restent cachées.
 * La lecture du PDF est lourde : à appeler dans un bloc suspendu.
 */
const EMPTY_OFFER: ClientBoardingOffer = { cards: [], full: [] };

export type ClientBoardingBundle = {
  offer: ClientBoardingOffer;
  flights: BoardingFlightRef[];
  travelers: BoardingTravelerName[];
};

const EMPTY_BUNDLE: ClientBoardingBundle = { offer: EMPTY_OFFER, flights: [], travelers: [] };

/**
 * Séjour visible du client, ou un dossier où il voyage.
 * Le voyage d’un collaborateur facturé à la société ne s’ouvre pas.
 * Un dossier caché ou archivé non plus.
 */
export async function visibleClientBooking(
  customer: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id" | "first_name" | "last_name"> &
    Partial<Pick<CrmCustomer, "usage_name">>,
  bookingId: string
) {
  try {
    const admin = createServiceClient();
    const scope = await clientBookingScope(customer);
    const { data } = await admin
      .from("crm_bookings")
      .select("id, customer_id, visible_to_client, archived_at, reference")
      .eq("id", bookingId)
      .maybeSingle();
    if (!data || !clientMayReadBooking(data as { id: string; customer_id: string | null; visible_to_client: boolean | null; archived_at: string | null }, scope)) {
      return null;
    }
    return data as { id: string; reference: string | null };
  } catch {
    return null;
  }
}

export async function visibleClientBookingByReference(
  customer: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id" | "first_name" | "last_name"> &
    Partial<Pick<CrmCustomer, "usage_name">>,
  reference: string
) {
  const ref = reference.trim();
  if (!ref) return null;
  try {
    const admin = createServiceClient();
    const scope = await clientBookingScope(customer);
    const { data } = await admin
      .from("crm_bookings")
      .select("id, customer_id, visible_to_client, archived_at, reference")
      .eq("reference", ref)
      .maybeSingle();
    if (!data || !clientMayReadBooking(data as { id: string; customer_id: string | null; visible_to_client: boolean | null; archived_at: string | null }, scope)) {
      return null;
    }
    return data as { id: string; reference: string | null };
  } catch {
    return null;
  }
}

export const loadClientBoardingOffer = cache(async (bookingId: string): Promise<ClientBoardingBundle> => {
  try {
    const admin = createServiceClient();
    const [docsRes, itemsRes, travelersRes] = await Promise.all([
      queryWithOptionalColumn(
        (columns) =>
          admin.from("crm_booking_documents").select(columns).eq("booking_id", bookingId).in("kind", KINDS),
        "id, kind, file_name, mime_type, storage_path, booking_item_id",
        "extracted"
      ),
      admin
        .from("crm_booking_items")
        .select("id, kind, title, supplier, start_at, end_at, details, visible_to_client, lifecycle, source_document_id")
        .eq("booking_id", bookingId)
        .eq("kind", "flight"),
      admin
        .from("crm_booking_travelers")
        .select("first_name, last_name, created_at")
        .eq("booking_id", bookingId)
        .order("created_at"),
    ]);
    if (docsRes.error || itemsRes.error) return EMPTY_BUNDLE;
    const flights = (itemsRes.data || []) as BoardingFlightRef[];
    const parts: ClientBoardingOffer[] = [];
    const wallets: (BoardingDocRef & { mime_type?: string | null; extracted?: unknown })[] = [];
    for (const row of docsRes.data || []) {
      const doc = row as unknown as BoardingDocRef & { mime_type?: string | null; storage_path?: string | null; extracted?: unknown };
      if (pieceEstRetiree(doc.extracted)) continue;
      if (isWalletPassName(doc.file_name, doc.mime_type)) {
        wallets.push(doc);
        continue;
      }
      if (!isBoardingPassFile(doc) || !doc.storage_path) continue;
      try {
        const file = await downloadCrmFile(doc.storage_path);
        const texts = await boardingPassPageTexts(file.bytes);
        const read = readBoardingPassPages(texts);
        parts.push(
          boardingOfferForDocument({
            doc,
            passengers: read.passengers,
            flights,
            pageCount: Math.max(texts.length, 1),
          })
        );
      } catch {
        continue;
      }
    }
    const travelers = ((travelersRes.data || []) as { first_name?: string | null; last_name?: string | null }[]).map(
      (row) => ({ firstName: row.first_name || "", lastName: row.last_name || "" })
    );
    return {
      offer: withWalletPasses(mergeBoardingOffers(parts), wallets, flights),
      flights,
      travelers,
    };
  } catch {
    return EMPTY_BUNDLE;
  }
});

export const loadClientBoardingCards = cache(async (bookingId: string) => {
  return (await loadClientBoardingOffer(bookingId)).offer.cards;
});

/** Statut d’enregistrement par vol. Une carte déjà au dossier monte à « cartes reçues ». */
export const loadClientCheckinStatus = cache(async (bookingId: string) => {
  try {
    const context = await loadCheckinContext(createServiceClient(), bookingId);
    const map: Record<string, string> = {};
    for (const view of viewsFromContext(context)) map[view.itemId] = view.status;
    return map;
  } catch {
    return {};
  }
});

/** Séjours de cette liste qui ont une carte d’embarquement, sans ouvrir les PDF. */
export async function boardingPassBookingIds(bookingIds: string[]) {
  const ready = new Set<string>();
  if (!bookingIds.length) return ready;
  try {
    const admin = createServiceClient();
    const result = await queryWithOptionalColumn(
      (columns) =>
        admin.from("crm_booking_documents").select(columns).in("booking_id", bookingIds).in("kind", KINDS),
      "booking_id, kind",
      "extracted"
    );
    if (result.error || !result.data) return ready;
    for (const row of result.data as { booking_id?: string; extracted?: unknown }[]) {
      if (pieceEstRetiree(row.extracted)) continue;
      if (row.booking_id) ready.add(row.booking_id);
    }
  } catch {
    return ready;
  }
  return ready;
}
