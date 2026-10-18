import { formatSiretInput } from "./billing";
import { shownPersonName } from "./identity";
import { formatDateRangeShort } from "./money";
import { fold } from "./text";

/** Même délai que les champs ville et société (`PlaceField`, `CompanyLookup`). */
export const OMNIBAR_DEBOUNCE_MS = 280;
export const OMNIBAR_MIN_CHARS = 2;
export const OMNIBAR_LIMIT = 5;

export const OMNIBAR_GROUPS = [
  { id: "clients", label: "Clients" },
  { id: "dossiers", label: "Dossiers" },
  { id: "voyageurs", label: "Voyageurs" },
] as const;

export type OmnibarGroupId = (typeof OMNIBAR_GROUPS)[number]["id"];

export type OmnibarHit = {
  id: string;
  group: OmnibarGroupId;
  href: string;
  title: string;
  subtitle: string;
};

export type OmnibarPayload = Record<OmnibarGroupId, OmnibarHit[]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Même repli que `crm_private.fold_search` : minuscules, sans accent, ponctuation en espace,
 * puis la forme collée (« TB-2026-0088 » → « tb 2026 0088 tb20260088 »).
 */
export function foldSearch(value: string | null | undefined) {
  const prepared = (value || "")
    .replaceAll("Œ", "oe")
    .replaceAll("œ", "oe")
    .replaceAll("Æ", "ae")
    .replaceAll("æ", "ae");
  const folded = fold(prepared);
  const spaced = folded.replace(/[^a-z0-9]+/g, " ").trim();
  const compact = spaced.replace(/ /g, "");
  if (!spaced) return "";
  return `${spaced} ${compact}`;
}

/** Texte envoyé à la fonction SQL, ou vide sous deux signes utiles. */
export function omnibarNeedle(query: string | null | undefined) {
  const trimmed = (query || "").trim().slice(0, 80);
  const compact = foldSearch(trimmed).split(" ").at(-1) || "";
  return compact.length >= OMNIBAR_MIN_CHARS ? trimmed : "";
}

export function emptyOmnibar(): OmnibarPayload {
  return { clients: [], dossiers: [], voyageurs: [] };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: unknown) {
  const id = text(value);
  return UUID.test(id) ? id : "";
}

function clientSubtitle(company: string, siret: string) {
  const parts = [company, siret ? `SIRET ${formatSiretInput(siret)}` : ""].filter(Boolean);
  return parts.join(" · ") || "Client";
}

function dossierSubtitle(row: {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  archived: boolean;
}) {
  const destination =
    row.destination && fold(row.destination) !== fold(row.title) ? row.destination : "";
  const dates =
    row.start_date || row.end_date ? formatDateRangeShort(row.start_date, row.end_date) : "";
  return [destination, dates, row.archived ? "Archivée" : ""].filter(Boolean).join(" · ");
}

function asRows(value: unknown) {
  return Array.isArray(value) ? value : [];
}

/** Met en forme la réponse SQL : libellés, liens admin, plafond par groupe. */
export function shapeOmnibar(data: unknown): OmnibarPayload {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const clients: OmnibarHit[] = [];
  for (const raw of asRows(source.clients)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = uuid(row.id);
    if (!id) continue;
    const person = shownPersonName({
      first_name: text(row.first_name),
      last_name: text(row.last_name),
    });
    clients.push({
      id,
      group: "clients",
      href: `/admin/clients/${id}`,
      title: person || "Client",
      subtitle: clientSubtitle(text(row.company_name), text(row.siret)),
    });
    if (clients.length >= OMNIBAR_LIMIT) break;
  }

  const dossiers: OmnibarHit[] = [];
  for (const raw of asRows(source.dossiers)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = uuid(row.id);
    if (!id) continue;
    const reference = text(row.reference);
    const title = text(row.title);
    const destination = text(row.destination);
    const headline = title || destination || "Dossier";
    dossiers.push({
      id,
      group: "dossiers",
      href: `/admin/reservations/${id}`,
      title: reference ? `${reference} · ${headline}` : headline,
      subtitle: dossierSubtitle({
        title,
        destination,
        start_date: text(row.start_date),
        end_date: text(row.end_date),
        archived: Boolean(row.archived_at),
      }),
    });
    if (dossiers.length >= OMNIBAR_LIMIT) break;
  }

  const voyageurs: OmnibarHit[] = [];
  for (const raw of asRows(source.voyageurs)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = uuid(row.id);
    const customerId = uuid(row.customer_id);
    const bookingId = uuid(row.booking_id);
    const sourceKind = text(row.source);
    const href =
      sourceKind === "companion" && customerId
        ? `/admin/clients/${customerId}#accompagnateurs`
        : bookingId
          ? `/admin/reservations/${bookingId}`
          : customerId
            ? `/admin/clients/${customerId}#accompagnateurs`
            : "";
    if (!id || !href) continue;
    const person = shownPersonName({
      first_name: text(row.first_name),
      last_name: text(row.last_name),
    });
    if (!person) continue;
    const relationship = text(row.relationship);
    const context = text(row.context);
    const bookingTitle = text(row.booking_title);
    const reference = text(row.reference);
    const subtitle =
      sourceKind === "traveler"
        ? [reference, bookingTitle].filter(Boolean).join(" · ") || "Voyageur"
        : [relationship || "Voyageur", context].filter(Boolean).join(" · ");
    voyageurs.push({
      id,
      group: "voyageurs",
      href,
      title: person,
      subtitle,
    });
    if (voyageurs.length >= OMNIBAR_LIMIT) break;
  }

  return { clients, dossiers, voyageurs };
}

function isAdminHref(value: string) {
  return value.startsWith("/admin/") && !value.includes("://") && !value.includes("\\");
}

/** Réponse JSON du endpoint : on ne garde qu’un lien interne d’admin. */
export function readOmnibarPayload(data: unknown): OmnibarPayload {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const group = (id: OmnibarGroupId): OmnibarHit[] => {
    const rows = Array.isArray(source[id]) ? source[id] : [];
    const hits: OmnibarHit[] = [];
    for (const item of rows) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const href = typeof row.href === "string" ? row.href : "";
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const idValue = typeof row.id === "string" ? row.id : "";
      if (!idValue || !title || !isAdminHref(href)) continue;
      hits.push({
        id: idValue,
        group: id,
        href,
        title,
        subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
      });
      if (hits.length >= OMNIBAR_LIMIT) break;
    }
    return hits;
  };
  return {
    clients: group("clients"),
    dossiers: group("dossiers"),
    voyageurs: group("voyageurs"),
  };
}

export function flattenOmnibar(payload: OmnibarPayload) {
  return OMNIBAR_GROUPS.flatMap((group) => payload[group.id]);
}

export function omnibarCount(payload: OmnibarPayload) {
  return flattenOmnibar(payload).length;
}

export type OmnibarKeyAction =
  | { type: "move"; index: number }
  | { type: "pick"; index: number }
  | { type: "submit" }
  | { type: "close" }
  | { type: "noop" };

/** Flèches, Entrée, Échap. Entrée sans ligne active laisse la recherche complète. */
export function omnibarOnKey(
  key: string,
  state: { open: boolean; count: number; index: number }
): OmnibarKeyAction {
  const { open, count, index } = state;
  if (key === "ArrowDown" && count > 0) {
    const next = !open || index < 0 ? 0 : (index + 1) % count;
    return { type: "move", index: next };
  }
  if (key === "ArrowUp" && count > 0) {
    const next = !open || index < 0 ? count - 1 : (index - 1 + count) % count;
    return { type: "move", index: next };
  }
  if (key === "Enter") {
    if (open && index >= 0 && index < count) return { type: "pick", index };
    return { type: "submit" };
  }
  if (key === "Escape") return open ? { type: "close" } : { type: "noop" };
  return { type: "noop" };
}

type OmnibarRpc = {
  rpc: (
    fn: "crm_omnibar_suggest",
    args: { q: string }
  ) => PromiseLike<{ data: unknown; error: { message?: string | null; code?: string | null } | null }>;
};

/** Appelle la fonction indexée. Une saisie trop courte ne part pas. */
export async function loadOmnibar(supabase: OmnibarRpc, query: string): Promise<OmnibarPayload> {
  const needle = omnibarNeedle(query);
  if (!needle) return emptyOmnibar();
  const { data, error } = await supabase.rpc("crm_omnibar_suggest", { q: needle });
  if (error) throw error;
  return shapeOmnibar(data);
}
