import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { recordAgencyJournal, type AgencyJournalInput } from "@/lib/crm/agency-log";
import { toAuditRow } from "@/lib/crm/audit-events";
import { hotelOptionState, type HotelOptionState } from "@/lib/crm/hotel-access";
import { readHotelButtonVisibility, readPendingAccess, writeHotelAccess } from "@/lib/crm/hotel-access-run";
import { shownPersonName } from "@/lib/crm/identity";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Option Hôtels d’un client, par le connecteur : le même interrupteur que la
 * carte « Accès Hôtels » de la fiche agence. Activer montre l’entrée Hôtels dans
 * l’espace client ; le client cherche et confie sa demande à l’agence. Rien n’est
 * réservé tout seul, aucun message ne part. Chaque changement est dans
 * `crm_hotel_access_events`, sur la fiche (`crm_audit_events`) et au journal
 * d’agence (`crm_agency_journal`), au nom du jeton.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CUSTOMER_COLUMNS = "id, first_name, last_name, hotel_booking_enabled, hotel_demo, hotel_direct_live";

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  hotel_booking_enabled: boolean | null;
  hotel_demo: boolean | null;
  hotel_direct_live: boolean | null;
};

export type HotelOptionDraft = {
  id: string;
  actif: boolean;
  /** undefined : le mode déjà enregistré reste. */
  modeReel: boolean | undefined;
};

export type HotelOptionDeps = {
  journal?: (entry: AgencyJournalInput) => Promise<void>;
};

export type HotelOptionResult = {
  id: string;
  client: string;
  option_hotel: HotelOptionState;
  avant: Pick<HotelOptionState, "active" | "mode">;
  inchange: boolean;
  notifie: false;
};

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function flag(value: unknown, label: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if (["true", "oui", "vrai", "1", "on", "actif", "active"].includes(key)) return true;
    if (["false", "non", "faux", "0", "off", "inactif", "inactive"].includes(key)) return false;
  }
  throw new McpWriteError(`${label} : oui ou non.`);
}

/** id du client, actif (obligatoire), mode_reel (facultatif). */
export function prepareHotelOption(input: Record<string, unknown>): HotelOptionDraft {
  const raw = "id" in input ? input.id : input.client_id;
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError("Client invalide.");
  if (!("actif" in input) || input.actif == null || input.actif === "") {
    throw new McpWriteError("Indiquez actif : oui pour activer, non pour désactiver.");
  }
  const actif = flag(input.actif, "actif");
  const modeReel =
    "mode_reel" in input && input.mode_reel != null && input.mode_reel !== "" ? flag(input.mode_reel, "mode_reel") : undefined;
  if (!actif && modeReel === true) throw new McpWriteError("Le mode réel suppose l’option active.");
  return { id, actif, modeReel };
}

/** Le mode réel ne s’ouvre que si on le demande ; il se ferme avec l’option. */
export function nextLiveMode(draft: HotelOptionDraft, current: boolean) {
  if (!draft.actif) return false;
  return draft.modeReel ?? current;
}

export function hotelOptionSummary(input: { client: string; active: boolean; mode: "test" | "reel"; actor: string }) {
  const verb = input.active ? `activée (mode ${input.mode})` : "désactivée";
  return `Option Hôtels ${verb} pour ${input.client} par le connecteur ${input.actor.slice(0, 40)}.`;
}

export async function setHotelOption(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: HotelOptionDeps
): Promise<HotelOptionResult> {
  const draft = prepareHotelOption(input);
  const db = client(admin);
  const { data, error } = await db.from("crm_customers").select(CUSTOMER_COLUMNS).eq("id", draft.id).maybeSingle();
  if (error) throw new McpWriteError("Client introuvable.");
  const row = (data as CustomerRow | null) ?? null;
  if (!row) throw new McpWriteError("Client introuvable.");

  const demo = row.hotel_demo === true;
  if (demo && draft.modeReel === true) {
    throw new McpWriteError("Compte de démonstration : le mode réel reste impossible.");
  }
  const [visibility, pending] = await Promise.all([readHotelButtonVisibility(db), readPendingAccess(draft.id, db)]);
  const before = hotelOptionState({ customer: row, visibility, pending: Boolean(pending) });
  const live = nextLiveMode(draft, row.hotel_direct_live === true);
  const name = shownPersonName(row) || "Client";
  const unchanged = before.active === draft.actif && (before.mode === "reel") === live;
  if (unchanged) {
    return { id: row.id, client: name, option_hotel: before, avant: { active: before.active, mode: before.mode }, inchange: true, notifie: false };
  }

  const saved = await writeHotelAccess({
    actor: "connector",
    staffId: null,
    customerId: row.id,
    enabled: draft.actif,
    demo,
    live,
    db,
  });
  if (!saved.ok) throw new McpWriteError(saved.error);

  const after = hotelOptionState({
    customer: { hotel_booking_enabled: saved.enabled, hotel_demo: demo, hotel_direct_live: saved.live },
    visibility,
    pending: Boolean(pending),
  });
  const actor = currentMcpAccess().actor;
  const summary = hotelOptionSummary({ client: name, active: after.active, mode: after.mode, actor });
  const diff = {
    avant: { active: before.active, mode: before.mode },
    apres: { active: after.active, mode: after.mode },
  };

  const audit = toAuditRow({
    actorKind: "auto",
    action: "option_hotel",
    customerId: row.id,
    summary,
    detail: { ...diff, acteur: actor },
    source: "mcp",
  });
  const first = await db.from("crm_audit_events").insert(audit);
  if (first.error && (first.error.code === "PGRST204" || first.error.code === "42703")) {
    const { source: _source, ...rest } = audit;
    await db.from("crm_audit_events").insert(rest);
  }

  await (deps?.journal ?? recordAgencyJournal)({
    staffId: null,
    action: "update",
    entityType: "client",
    entityId: row.id,
    summary,
    diff,
    path: "/api/mcp",
  });

  return { id: row.id, client: name, option_hotel: after, avant: diff.avant, inchange: false, notifie: false };
}
