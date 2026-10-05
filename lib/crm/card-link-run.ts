import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { hotelDisplayName } from "./carnet";
import {
  CARD_LINK_MAX_OPENS,
  cardLinkCode,
  cardLinkDecision,
  cardLinkHash,
  cardLinkUrl,
  clientCardPurgeDue,
  isCardLinkCode,
  type CardLinkSource,
} from "./card-link";
import { downloadCrmFile, removeCrmFiles } from "./files";
import { cardCloseDate, parisIsoDate } from "./hotel-arrival";
import { isAgencyCardPath, isSafeCrmPath } from "./files-access";
import { pliantConfigured, pliantPciWidget } from "./pliant";
import type { CrmBookingItem } from "./types";

type Admin = Pick<SupabaseClient, "from">;

type LinkRow = {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  source: CardLinkSource;
  pliant_card_id: string | null;
  client_card_path: string | null;
  expires_at: string;
  max_opens: number | null;
  open_count: number | null;
  revoked_at: string | null;
};

/**
 * Nouveau lien carte pour un courrier d’hôtel. Le code n’existe que dans l’URL renvoyée ;
 * la base garde son empreinte. Après l’envoi, `settleCardLinks` coupe les anciens liens du
 * même courrier (relance, mauvaise adresse) ; si l’envoi échoue, il coupe celui-ci.
 */
export async function createCardLink(
  admin: Admin,
  input: {
    origin: string;
    bookingId: string;
    itemId: string;
    requestId: string | null;
    source: CardLinkSource;
    pliantCardId?: string | null;
    clientCardPath?: string | null;
    staffId?: string | null;
    expiresAt: Date;
  }
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = cardLinkCode();
    const { data, error } = await admin
      .from("crm_card_links")
      .insert({
        code_hash: cardLinkHash(code),
        booking_id: input.bookingId,
        booking_item_id: input.itemId,
        hotel_request_id: input.requestId,
        source: input.source,
        pliant_card_id: input.source === "pliant" ? input.pliantCardId || null : null,
        client_card_path: input.source === "client" ? input.clientCardPath || null : null,
        created_by_staff_id: input.staffId || null,
        expires_at: input.expiresAt.toISOString(),
        max_opens: CARD_LINK_MAX_OPENS,
      })
      .select("id")
      .single();
    if (!error && data?.id) {
      return { id: String(data.id), url: cardLinkUrl(input.origin, code), expiresAt: input.expiresAt };
    }
    if (!/duplicate|unique/i.test(error?.message || "")) {
      console.error("[card-link] création", error?.code ?? "?");
      throw new Error("Le lien carte n’a pas pu être créé. Réessayez.");
    }
  }
  throw new Error("Le lien carte n’a pas pu être créé. Réessayez.");
}

/**
 * Courrier parti : un seul lien vivant par courrier, le nouveau. Courrier non parti : le nouveau
 * lien, jamais envoyé, est coupé et l’ancien reste valable. Best-effort, journalisé si échec.
 */
export async function settleCardLinks(
  admin: Admin,
  input: { linkId: string; requestId: string | null; sent: boolean }
) {
  const now = new Date().toISOString();
  try {
    if (!input.sent) {
      await admin.from("crm_card_links").update({ revoked_at: now }).eq("id", input.linkId);
      return;
    }
    if (!input.requestId) return;
    await admin
      .from("crm_card_links")
      .update({ revoked_at: now })
      .eq("hotel_request_id", input.requestId)
      .neq("id", input.linkId)
      .is("revoked_at", null);
  } catch {
    console.error("[card-link] anciens liens non coupés");
  }
}

async function loadLink(admin: Admin, code: string) {
  if (!isCardLinkCode(code)) return null;
  const { data } = await admin.from("crm_card_links").select("*").eq("code_hash", cardLinkHash(code)).maybeSingle();
  return (data as LinkRow | null) ?? null;
}

export type CardLinkStatus =
  | { alive: false }
  | { alive: true; hotel: string; reference: string; opensLeft: number; expiresAt: string; source: CardLinkSource };

/** Lecture sans effet, pour la page d’accueil du lien (un aperçu ou un scanner n’ouvre rien). */
export async function cardLinkStatus(code: string): Promise<CardLinkStatus> {
  const admin = createServiceClient();
  const link = await loadLink(admin, code);
  if (!link || cardLinkDecision({ now: new Date(), expiresAt: link.expires_at, revokedAt: link.revoked_at, openCount: link.open_count, maxOpens: link.max_opens }) !== "open") {
    return { alive: false };
  }
  const [{ data: booking }, { data: item }] = await Promise.all([
    admin.from("crm_bookings").select("reference").eq("id", link.booking_id).maybeSingle(),
    link.booking_item_id
      ? admin.from("crm_booking_items").select("*").eq("id", link.booking_item_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    alive: true,
    hotel: item ? hotelDisplayName(item as CrmBookingItem) || "" : "",
    reference: (booking as { reference?: string } | null)?.reference || "",
    opensLeft: Math.max(0, (link.max_opens ?? CARD_LINK_MAX_OPENS) - (link.open_count ?? 0)),
    expiresAt: link.expires_at,
    source: link.source,
  };
}

export type CardLinkOpen =
  | {
      ok: true;
      source: CardLinkSource;
      opensLeft: number;
      widget?: { src: string; frameId: string };
      file?: { mime: string; name: string; bytes: string };
    }
  | { ok: false; status: number; error: string };

const DEAD = "Ce lien ne s’ouvre plus. Demandez un nouveau lien à l’agence.";

/**
 * Ouverture par l’hôtel : une ouverture de plus (verrou optimiste), la carte, puis la trace
 * dans crm_card_views. Sans trace, rien n’est montré.
 */
export async function openCardLink(code: string): Promise<CardLinkOpen> {
  const admin = createServiceClient();
  const link = await loadLink(admin, code);
  if (!link) return { ok: false, status: 404, error: DEAD };
  const decision = cardLinkDecision({
    now: new Date(),
    expiresAt: link.expires_at,
    revokedAt: link.revoked_at,
    openCount: link.open_count,
    maxOpens: link.max_opens,
  });
  if (decision !== "open") return { ok: false, status: 410, error: DEAD };

  const count = link.open_count ?? 0;
  const { data: claimed } = await admin
    .from("crm_card_links")
    .update({ open_count: count + 1 })
    .eq("id", link.id)
    .eq("open_count", count)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, status: 409, error: "Le lien vient d’être ouvert ailleurs. Réessayez." };

  const release = async () => {
    await admin.from("crm_card_links").update({ open_count: count }).eq("id", link.id).eq("open_count", count + 1);
  };

  let widget: { src: string; frameId: string } | undefined;
  let file: { mime: string; name: string; bytes: string } | undefined;
  try {
    if (link.source === "pliant") {
      if (!link.pliant_card_id || !pliantConfigured()) throw new Error("pliant");
      if (link.booking_item_id) {
        const { data: arrival } = await admin
          .from("crm_hotel_arrivals")
          .select("card_closed_at, pliant_card_id")
          .eq("booking_item_id", link.booking_item_id)
          .maybeSingle();
        const row = arrival as { card_closed_at: string | null; pliant_card_id: string | null } | null;
        if (row?.card_closed_at && row.pliant_card_id === link.pliant_card_id) {
          await release();
          return { ok: false, status: 410, error: "Cette carte est clôturée. Contactez l’agence." };
        }
      }
      widget = await pliantPciWidget(link.pliant_card_id, `carte-${link.id.slice(0, 8)}`);
    } else {
      const path = link.client_card_path || "";
      if (!path || !isSafeCrmPath(path) || !isAgencyCardPath(path)) throw new Error("client");
      const downloaded = await downloadCrmFile(path);
      file = {
        mime: downloaded.contentType || "application/octet-stream",
        name: "carte-client",
        bytes: Buffer.from(downloaded.bytes).toString("base64"),
      };
    }
  } catch {
    await release();
    return { ok: false, status: 502, error: "La carte n’a pas pu être affichée. Réessayez dans un instant." };
  }

  const { error: viewError } = await admin.from("crm_card_views").insert({
    viewer: "hotel",
    card_link_id: link.id,
    staff_id: null,
    booking_id: link.booking_id,
    booking_item_id: link.booking_item_id,
    source: link.source,
  });
  if (viewError) {
    await release();
    console.error("[card-link] trace", viewError.code ?? "?");
    return { ok: false, status: 500, error: "La carte n’a pas pu être affichée. Réessayez dans un instant." };
  }

  return {
    ok: true,
    source: link.source,
    opensLeft: Math.max(0, (link.max_opens ?? CARD_LINK_MAX_OPENS) - count - 1),
    widget,
    file,
  };
}

/**
 * Photos de cartes clients (`agency-cards/`) effacées après la fermeture de la carte du séjour,
 * et leurs liens coupés. Appelé par le cron des arrivées hôtel. Renvoie le nombre de photos effacées.
 */
export async function purgeClientStayCards(admin: Admin, now = new Date()) {
  const today = parisIsoDate(now);
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("id, booking_item_id, client_card_path")
    .not("client_card_path", "is", null)
    .limit(200);
  const rows = (data || []) as { id: string; booking_item_id: string | null; client_card_path: string | null }[];
  const itemIds = [...new Set(rows.map((row) => row.booking_item_id).filter(Boolean))] as string[];
  if (!itemIds.length) return 0;
  const { data: items } = await admin.from("crm_booking_items").select("id, start_at, end_at").in("id", itemIds);
  const checkOut = new Map(
    ((items || []) as { id: string; start_at: string | null; end_at: string | null }[]).map((item) => [
      item.id,
      (item.end_at || item.start_at || "").slice(0, 10),
    ])
  );
  let purged = 0;
  for (const row of rows) {
    const out = row.booking_item_id ? checkOut.get(row.booking_item_id) : "";
    if (!out || !clientCardPurgeDue(cardCloseDate(out), today)) continue;
    const path = row.client_card_path || "";
    try {
      if (path && isSafeCrmPath(path) && isAgencyCardPath(path)) await removeCrmFiles([path]);
      await admin.from("crm_hotel_arrivals").update({ client_card_path: null, client_card_name: null }).eq("id", row.id);
      await admin
        .from("crm_card_links")
        .update({ revoked_at: now.toISOString() })
        .eq("booking_item_id", row.booking_item_id)
        .eq("source", "client")
        .is("revoked_at", null);
      purged += 1;
    } catch {
      console.error("[card-link] photo de carte non effacée");
    }
  }
  return purged;
}
