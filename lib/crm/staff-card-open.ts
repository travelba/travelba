import "server-only";

import { downloadCrmFile } from "./files";
import { isAgencyCardPath, isSafeCrmPath } from "./files-access";
import { pliantConfigured, pliantPciWidget } from "./pliant";
import { AGENCY_MASTER_CODE_HASH, staffCardCodeMatches } from "./staff-card-code";
import type { CardViewLine, CrmHotelArrival } from "./types";

type Admin = { from: (table: string) => any };

export type AgencyCardSource = "pliant" | "client";

/** En pause : l'agence connectée ouvre la carte sans code. */
const STAFF_CARD_CODE_REQUIRED = false;

type OpenError = { error: string; status: number };

function fail(error: string, status: number): OpenError {
  return { error, status };
}

export async function loadCardViews(admin: Admin, bookingId: string): Promise<CardViewLine[]> {
  const { data, error } = await admin
    .from("crm_card_views")
    .select("booking_item_id, source, created_at, staff_id")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  const rows = (data || []) as {
    booking_item_id: string | null;
    source: string;
    created_at: string;
    staff_id: string;
  }[];
  const ids = [...new Set(rows.map((row) => row.staff_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await admin.from("crm_staff").select("id, full_name").in("id", ids);
    for (const person of (people || []) as { id: string; full_name: string | null }[]) {
      names.set(person.id, person.full_name || "Agence");
    }
  }
  return rows
    .filter(
      (row): row is typeof row & { booking_item_id: string; source: AgencyCardSource } =>
        Boolean(row.booking_item_id) && (row.source === "pliant" || row.source === "client")
    )
    .map((row) => ({
      itemId: row.booking_item_id,
      source: row.source,
      name: names.get(row.staff_id) || "Agence",
      at: row.created_at,
    }));
}

export async function ensureAgencyMasterCode(admin: Admin, staffId: string) {
  const hash = AGENCY_MASTER_CODE_HASH;
  const { data } = await admin.from("crm_staff_card_codes").select("card_code_hash").eq("staff_id", staffId).maybeSingle();
  const stored = (data as { card_code_hash?: string | null } | null)?.card_code_hash || null;
  if (stored === hash) return;
  if (stored) {
    const { error } = await admin
      .from("crm_staff_card_codes")
      .update({ card_code_hash: hash, updated_at: new Date().toISOString() })
      .eq("staff_id", staffId);
    if (error) throw error;
    return;
  }
  const { error } = await admin.from("crm_staff_card_codes").insert({ staff_id: staffId, card_code_hash: hash });
  if (error) throw error;
}

export async function staffHasCardCode(admin: Admin, staffId: string) {
  await ensureAgencyMasterCode(admin, staffId);
  return true;
}

export async function openAgencyCard(input: {
  admin: Admin;
  staffId: string;
  staffName: string;
  code: string;
  bookingId: string;
  itemId: string;
  source: AgencyCardSource;
  define?: boolean;
}): Promise<
  | OpenError
  | {
      viewer: string;
      viewedAt: string;
      widget?: { src: string; frameId: string };
      file?: { mime: string; name: string; bytes: string };
    }
> {
  if (STAFF_CARD_CODE_REQUIRED) {
    const code = input.code.trim();
    try {
      await ensureAgencyMasterCode(input.admin, input.staffId);
    } catch {
      return fail("Le code n’a pas pu être enregistré.", 500);
    }
    if (!staffCardCodeMatches(code, AGENCY_MASTER_CODE_HASH)) return fail("Code incorrect.", 403);
  }

  const { data } = await input.admin
    .from("crm_hotel_arrivals")
    .select("id, pliant_card_id, card_closed_at, client_card_path, client_card_name")
    .eq("booking_id", input.bookingId)
    .eq("booking_item_id", input.itemId)
    .maybeSingle();
  const row = data as Pick<CrmHotelArrival, "id" | "pliant_card_id" | "card_closed_at" | "client_card_path" | "client_card_name"> | null;
  if (!row) return fail("Suivi introuvable.", 404);

  let widget: { src: string; frameId: string } | undefined;
  let file: { mime: string; name: string; bytes: string } | undefined;

  if (input.source === "pliant") {
    if (row.card_closed_at) return fail("Cette carte est clôturée.", 400);
    if (!row.pliant_card_id) return fail("Aucune carte émise.", 400);
    if (!pliantConfigured()) return fail("Pliant n’est pas branché.", 400);
    try {
      widget = await pliantPciWidget(row.pliant_card_id, `carte-${input.itemId}`);
    } catch {
      return fail("La carte n’a pas pu être lue.", 502);
    }
  } else {
    const path = row.client_card_path || "";
    if (!path || !isSafeCrmPath(path) || !isAgencyCardPath(path)) return fail("Aucune carte du client.", 400);
    try {
      const downloaded = await downloadCrmFile(path);
      file = {
        mime: downloaded.contentType || "application/octet-stream",
        name: (row.client_card_name || "carte-client").replace(/\d{6,}/g, "").trim() || "carte-client",
        bytes: Buffer.from(downloaded.bytes).toString("base64"),
      };
    } catch {
      return fail("La carte n’a pas pu être lue.", 502);
    }
  }

  const viewedAt = new Date().toISOString();
  if (STAFF_CARD_CODE_REQUIRED) {
    const { error: viewError } = await input.admin.from("crm_card_views").insert({
      staff_id: input.staffId,
      booking_id: input.bookingId,
      booking_item_id: input.itemId,
      source: input.source,
    });
    if (viewError) return fail("La consultation n’a pas pu être notée.", 500);
  }

  return { viewer: input.staffName || "Agence", viewedAt, widget, file };
}
