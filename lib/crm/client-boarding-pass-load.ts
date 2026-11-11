import "server-only";

import { cache } from "react";
import {
  boardingOfferForDocument,
  mergeBoardingOffers,
  type BoardingDocRef,
  type BoardingFlightRef,
  type ClientBoardingOffer,
} from "./client-boarding-pass";
import { clientTripOwnerIds } from "./company-peers";
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

/**
 * Séjour visible du client, y compris via un admin société.
 * Un dossier caché ou archivé ne s’ouvre pas.
 */
export async function visibleClientBooking(
  customer: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">,
  bookingId: string
) {
  try {
    const admin = createServiceClient();
    const owners = await clientTripOwnerIds(customer);
    const { data } = await admin
      .from("crm_bookings")
      .select("id, customer_id, visible_to_client, archived_at, reference")
      .eq("id", bookingId)
      .maybeSingle();
    if (!data || !owners.includes(String(data.customer_id || ""))) return null;
    if (!data.visible_to_client || data.archived_at) return null;
    return data as { id: string; reference: string | null };
  } catch {
    return null;
  }
}

export async function visibleClientBookingByReference(
  customer: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">,
  reference: string
) {
  const ref = reference.trim();
  if (!ref) return null;
  try {
    const admin = createServiceClient();
    const owners = await clientTripOwnerIds(customer);
    const { data } = await admin
      .from("crm_bookings")
      .select("id, customer_id, visible_to_client, archived_at, reference")
      .eq("reference", ref)
      .maybeSingle();
    if (!data || !owners.includes(String(data.customer_id || ""))) return null;
    if (!data.visible_to_client || data.archived_at) return null;
    return data as { id: string; reference: string | null };
  } catch {
    return null;
  }
}

export const loadClientBoardingOffer = cache(async (bookingId: string): Promise<ClientBoardingOffer> => {
  try {
    const admin = createServiceClient();
    const [docsRes, itemsRes] = await Promise.all([
      admin
        .from("crm_booking_documents")
        .select("id, kind, file_name, mime_type, storage_path, booking_item_id")
        .eq("booking_id", bookingId)
        .in("kind", KINDS),
      admin
        .from("crm_booking_items")
        .select("id, kind, title, start_at, details, visible_to_client, lifecycle, source_document_id")
        .eq("booking_id", bookingId)
        .eq("kind", "flight"),
    ]);
    if (docsRes.error || itemsRes.error) return EMPTY_OFFER;
    const flights = (itemsRes.data || []) as BoardingFlightRef[];
    const parts: ClientBoardingOffer[] = [];
    for (const row of docsRes.data || []) {
      const doc = row as BoardingDocRef & { mime_type?: string | null; storage_path?: string | null };
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
    return mergeBoardingOffers(parts);
  } catch {
    return EMPTY_OFFER;
  }
});

export const loadClientBoardingCards = cache(async (bookingId: string) => {
  return (await loadClientBoardingOffer(bookingId)).cards;
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
    const { data, error } = await admin
      .from("crm_booking_documents")
      .select("booking_id, kind")
      .in("booking_id", bookingIds)
      .in("kind", KINDS);
    if (error || !data) return ready;
    for (const row of data as { booking_id?: string }[]) {
      if (row.booking_id) ready.add(row.booking_id);
    }
  } catch {
    return ready;
  }
  return ready;
}
