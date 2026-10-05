/**
 * Un seul onglet sonde le serveur (réponses d’hôtel) : les autres écoutent sur un `BroadcastChannel`.
 * Le meneur écrit un battement `{ id, at }` ; un battement trop vieux laisse la place au premier qui réclame.
 */
export type LeaderRecord = { id: string; at: number };

export const TAB_CHANNEL = "tba-admin";
export const LEADER_KEY = "tba-admin-hotel-poll-leader";
/** Un battement plus vieux que ça : le meneur a disparu (onglet fermé sans prévenir, ordinateur en veille). */
export const LEADER_STALE_MS = 150_000;

export function parseLeaderRecord(raw: string | null | undefined): LeaderRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.at !== "number") return null;
    return { id: parsed.id, at: parsed.at };
  } catch {
    return null;
  }
}

/** Vrai si cet onglet peut sonder : aucun meneur, lui-même, ou un meneur muet depuis trop longtemps. */
export function shouldLead(record: LeaderRecord | null, selfId: string, now: number, staleMs = LEADER_STALE_MS) {
  if (!record) return true;
  if (record.id === selfId) return true;
  return now - record.at > staleMs;
}

export function leaderRecord(selfId: string, now: number): LeaderRecord {
  return { id: selfId, at: now };
}

export function newTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
