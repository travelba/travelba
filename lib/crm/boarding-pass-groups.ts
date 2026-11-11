import { localCivilStamp, timezoneForIata } from "./airport-time";
import { detailStr, flightAirline, flightNumber, itemClock } from "./carnet";
import { DEFAULT_LAYOVER_MAX_HOURS } from "./layover";
import { firstNameOnlyMatches, lastNamesMatch } from "./person-match";
import type { CrmBookingItem } from "./types";

/**
 * Cartes d’embarquement rangées par vol, à partir des segments déjà en base.
 * Aller, Retour et Correspondance ne sont posés que si les codes IATA et les
 * horaires le permettent. Rien n’est inventé.
 */

export type BoardingLegRole = "aller" | "retour" | "correspondance";

export const BOARDING_LEG_LABEL: Record<BoardingLegRole, string> = {
  aller: "Aller",
  retour: "Retour",
  correspondance: "Correspondance",
};

export type BoardingSegment = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  airline: string;
  number: string;
  from: string;
  to: string;
  watchStatus: string | null;
};

export type BoardingTravelerName = {
  firstName: string;
  lastName?: string | null;
};

export type BoardingPassRef = {
  id: string;
  itemId: string | null;
  firstName: string;
  lastName?: string | null;
};

export type BoardingGroupFileInput = {
  id: string;
  href: string;
  label: string;
  itemIds: string[];
};

export type BoardingGroupFile = {
  id: string;
  href: string;
  label: string;
};

export type BoardingPassGroup<T> = {
  id: string;
  airline: string;
  number: string;
  route: string;
  when: string;
  role: BoardingLegRole | null;
  past: boolean;
  passes: T[];
  files: BoardingGroupFile[];
};

export type BoardingPassGrouping<T> = {
  upcoming: BoardingPassGroup<T>[];
  past: BoardingPassGroup<T>[];
  other: { passes: T[]; files: BoardingGroupFile[] } | null;
};

type FlightLike = {
  id: string;
  kind?: string | null;
  supplier?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
  visible_to_client?: boolean | null;
  lifecycle?: string | null;
};

const HOUR_MS = 3_600_000;
const IATA = /^[A-Z]{3}$/;

function iata(value: string) {
  const code = value.trim().toUpperCase();
  return IATA.test(code) ? code : "";
}

function compact(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function watchStatus(details: Record<string, unknown> | null | undefined) {
  const raw = details?.flight_watch;
  if (!raw || typeof raw !== "object") return null;
  const status = (raw as { status?: unknown }).status;
  return typeof status === "string" && status.trim() ? status.trim().toLowerCase() : null;
}

function wall(iso: string | null | undefined) {
  const match = (iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return null;
  const hour = match[4];
  const minute = match[5];
  const clock = Boolean(hour && !(hour === "00" && minute === "00"));
  const ms = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    clock ? Number(hour) : 0,
    clock ? Number(minute) : 0
  );
  return { ms, clock };
}

function whenLabel(startAt: string | null) {
  const day = (startAt || "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "";
  const clock = itemClock(startAt || "");
  return [date, clock].filter(Boolean).join(" · ");
}

/** Vols du séjour, dans l’ordre du départ. `clientVisible` retire les étapes cachées. */
export function boardingSegments(items: FlightLike[], options?: { clientVisible?: boolean }) {
  const segments: BoardingSegment[] = [];
  for (const item of items) {
    if (item.kind && item.kind !== "flight") continue;
    if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") continue;
    if (options?.clientVisible && item.visible_to_client === false) continue;
    const asItem = item as CrmBookingItem;
    const details = item.details || {};
    segments.push({
      id: item.id,
      startAt: item.start_at || null,
      endAt: item.end_at || null,
      airline: flightAirline({ supplier: item.supplier ?? null, details }) || "",
      number: flightNumber(asItem),
      from: iata(detailStr(asItem, "from")),
      to: iata(detailStr(asItem, "to")),
      watchStatus: watchStatus(details),
    });
  }
  return segments.sort(compareSegments);
}

function compareSegments(a: BoardingSegment, b: BoardingSegment) {
  const left = wall(a.startAt);
  const right = wall(b.startAt);
  if (!left && !right) return a.id.localeCompare(b.id);
  if (!left) return 1;
  if (!right) return -1;
  return left.ms - right.ms || a.id.localeCompare(b.id);
}

type Node = {
  segment: BoardingSegment;
  from: string;
  to: string;
  depart: number | null;
  arrive: number | null;
  departClock: boolean;
  arriveClock: boolean;
};

function nodesOf(segments: BoardingSegment[]): Node[] {
  return segments.map((segment) => {
    const depart = wall(segment.startAt);
    const arrive = wall(segment.endAt);
    return {
      segment,
      from: segment.from,
      to: segment.to,
      depart: depart?.ms ?? null,
      arrive: arrive?.ms ?? null,
      departClock: Boolean(depart?.clock),
      arriveClock: Boolean(arrive?.clock),
    };
  });
}

/** Écart en heures. Null si l’horloge ne permet pas de le mesurer. */
function layoverHours(prev: Node, next: Node) {
  if (prev.arriveClock && next.departClock && prev.arrive != null && next.depart != null) {
    return (next.depart - prev.arrive) / HOUR_MS;
  }
  if (!prev.arriveClock && prev.departClock && next.departClock && prev.depart != null && next.depart != null) {
    return (next.depart - prev.depart) / HOUR_MS;
  }
  return null;
}

function isConnection(prev: Node, next: Node, home: string) {
  if (!prev.to || !next.from || !next.to || prev.to !== next.from) return false;
  if (home && next.to === home) return false;
  const hours = layoverHours(prev, next);
  return hours != null && hours >= 0 && hours < DEFAULT_LAYOVER_MAX_HOURS;
}

function directions(nodes: Node[], home: string) {
  const dirs: Node[][] = [];
  for (const node of nodes) {
    const current = dirs[dirs.length - 1];
    const prev = current?.[current.length - 1];
    if (prev && current && isConnection(prev, node, home)) current.push(node);
    else dirs.push([node]);
  }
  return dirs;
}

function rolesOf(segments: BoardingSegment[]) {
  const nodes = nodesOf(segments);
  const home = nodes.find((node) => node.from)?.from || "";
  const dirs = directions(nodes, home);
  const roles = new Map<string, BoardingLegRole | null>();
  const claimed = new Set<number>();
  const returned = new Set<number>();
  dirs.forEach((dir, index) => {
    dir.forEach((node, hop) => {
      if (hop > 0) roles.set(node.segment.id, "correspondance");
    });
    const backTo = dir[dir.length - 1]?.to || "";
    const backFrom = dir[0]?.from || "";
    if (!backTo || !backFrom || backFrom === backTo) return;
    let outbound = -1;
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      if (claimed.has(earlier) || returned.has(earlier)) continue;
      const previous = dirs[earlier];
      const left = previous?.[0]?.from || "";
      const arrived = previous?.[previous.length - 1]?.to || "";
      if (left === backTo && arrived === backFrom) {
        outbound = earlier;
        break;
      }
    }
    if (outbound < 0) return;
    claimed.add(outbound);
    returned.add(index);
    const start = dirs[outbound]?.[0];
    if (start && roles.get(start.segment.id) !== "correspondance") roles.set(start.segment.id, "aller");
    if (roles.get(dir[0].segment.id) !== "correspondance") roles.set(dir[0].segment.id, "retour");
  });
  return roles;
}

/** Déjà posé. Un statut de suivi connu prime. Sinon l’heure d’arrivée locale, si le fuseau est connu. */
export function boardingSegmentLanded(segment: BoardingSegment, now: Date) {
  const status = segment.watchStatus || "";
  if (status === "landed") return true;
  if (status === "en_route" || status === "scheduled" || status === "delayed" || status === "cancelled" || status === "diverted") {
    return false;
  }
  const arrival = wall(segment.endAt);
  if (arrival?.clock) {
    const zone = timezoneForIata(segment.to);
    if (zone) {
      const stamp = localCivilStamp(segment.endAt, zone);
      const ms = stamp ? Date.parse(stamp) : Number.NaN;
      if (Number.isFinite(ms)) return ms <= now.getTime();
    }
  }
  const depart = wall(segment.startAt);
  if (depart?.clock && !arrival?.clock) {
    const zone = timezoneForIata(segment.from);
    if (zone) {
      const stamp = localCivilStamp(segment.startAt, zone);
      const ms = stamp ? Date.parse(stamp) : Number.NaN;
      if (Number.isFinite(ms) && now.getTime() - ms >= 30 * HOUR_MS) return true;
    }
  }
  const day = (segment.endAt || segment.startAt || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const dayMs = Date.parse(`${day}T00:00:00Z`);
    if (Number.isFinite(dayMs) && now.getTime() - dayMs >= 48 * HOUR_MS) return true;
  }
  return false;
}

function namesMatch(pass: BoardingPassRef, traveler: BoardingTravelerName) {
  const passFirst = pass.firstName || "";
  const travelerFirst = traveler.firstName || "";
  const first =
    firstNameOnlyMatches(passFirst, travelerFirst) || firstNameOnlyMatches(travelerFirst, passFirst);
  if (!first) return false;
  if (pass.lastName && traveler.lastName && !lastNamesMatch(pass.lastName, traveler.lastName)) return false;
  return true;
}

function orderPasses<T extends BoardingPassRef>(passes: T[], travelers: BoardingTravelerName[]) {
  if (!travelers.length) return passes;
  const used = new Set<number>();
  const rank = new Map<string, number>();
  travelers.forEach((traveler, travelerIndex) => {
    const hit = passes.findIndex((pass, index) => !used.has(index) && namesMatch(pass, traveler));
    if (hit < 0) return;
    used.add(hit);
    rank.set(passes[hit].id, travelerIndex);
  });
  return passes
    .map((pass, index) => ({ pass, index, rank: rank.has(pass.id) ? rank.get(pass.id)! : travelers.length + index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.pass);
}

function readExtract(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === "string" ? row[key].trim() : "");
  const flight = text("flight");
  const firstName = text("firstName");
  const lastName = text("lastName");
  const date = text("date");
  if (!flight && !firstName && !lastName) return null;
  return {
    flight,
    firstName,
    lastName,
    date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : "",
  };
}

/**
 * Vol d’une pièce déjà en base : le lien `booking_item_id`, sinon le vol lu
 * dans le passe Apple quand un seul segment correspond.
 */
export function documentFlightId(
  doc: { booking_item_id?: string | null; extracted?: unknown },
  segments: BoardingSegment[]
) {
  if (doc.booking_item_id && segments.some((segment) => segment.id === doc.booking_item_id)) {
    return doc.booking_item_id;
  }
  const extract = readExtract(doc.extracted);
  const code = compact(extract?.flight || "");
  if (code.length < 4) return null;
  const sameNumber = segments.filter((segment) => compact(segment.number) === code);
  if (sameNumber.length === 1) return sameNumber[0].id;
  if (extract?.date) {
    const sameDay = sameNumber.filter((segment) => (segment.startAt || "").slice(0, 10) === extract.date);
    if (sameDay.length === 1) return sameDay[0].id;
  }
  return null;
}

function emptyGroup<T>(segment: BoardingSegment, role: BoardingLegRole | null, past: boolean): BoardingPassGroup<T> {
  return {
    id: segment.id,
    airline: segment.airline,
    number: segment.number,
    route: segment.from && segment.to ? `${segment.from} → ${segment.to}` : "",
    when: whenLabel(segment.startAt),
    role,
    past,
    passes: [],
    files: [],
  };
}

/**
 * Prochains vols d’abord, dans l’ordre du départ. Les vols déjà posés sont à part.
 * Une carte sans vol va dans « autres ». Le PDF complet suit son vol, une seule fois.
 */
export function groupBoardingPasses<T extends BoardingPassRef>(input: {
  segments: BoardingSegment[];
  passes: T[];
  files?: BoardingGroupFileInput[];
  travelers?: BoardingTravelerName[];
  now?: Date;
}): BoardingPassGrouping<T> {
  const now = input.now || new Date();
  const segments = [...input.segments].sort(compareSegments);
  const roles = rolesOf(segments);
  const byId = new Map<string, BoardingPassGroup<T>>();
  for (const segment of segments) {
    byId.set(segment.id, emptyGroup(segment, roles.get(segment.id) || null, boardingSegmentLanded(segment, now)));
  }
  const loose: T[] = [];
  for (const pass of input.passes) {
    const group = pass.itemId ? byId.get(pass.itemId) : null;
    if (group) group.passes.push(pass);
    else loose.push(pass);
  }
  const looseFiles: BoardingGroupFile[] = [];
  const seenFiles = new Set<string>();
  for (const file of input.files || []) {
    if (!file.href || seenFiles.has(file.href)) continue;
    const ids = [...new Set(file.itemIds.filter((id) => byId.has(id)))];
    ids.sort((a, b) => segments.findIndex((segment) => segment.id === a) - segments.findIndex((segment) => segment.id === b));
    const target = ids[0] ? byId.get(ids[0]) : null;
    const link = { id: file.id, href: file.href, label: file.label };
    if (target) {
      target.files.push(link);
      seenFiles.add(file.href);
    } else {
      looseFiles.push(link);
      seenFiles.add(file.href);
    }
  }
  const travelers = input.travelers || [];
  const groups = segments
    .map((segment) => byId.get(segment.id))
    .filter((group): group is BoardingPassGroup<T> => Boolean(group && (group.passes.length || group.files.length)))
    .map((group) => ({ ...group, passes: orderPasses(group.passes, travelers) }));
  const otherPasses = orderPasses(loose, travelers);
  return {
    upcoming: groups.filter((group) => !group.past),
    past: groups.filter((group) => group.past),
    other: otherPasses.length || looseFiles.length ? { passes: otherPasses, files: looseFiles } : null,
  };
}
