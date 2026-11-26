import assert from "node:assert/strict";
import test from "node:test";
import { settleTakeoverIdle } from "./whatsapp-handoff";
import {
  DEFAULT_HUMAN_PAUSE_HOURS,
  TAKEOVER_IDLE_MS,
  handoffSystemBody,
  humanPauseHours,
  humanPauseUntil,
  inboundAlreadyHandled,
  takeoverIdleDue,
  threadIsPaused,
  type TakeoverBeat,
} from "./whatsapp-takeover";

const NOW = new Date("2026-10-21T12:32:00.000Z");
const PAUSE = "2026-10-22T06:00:00.000Z";

function beat(partial: Partial<TakeoverBeat> & Pick<TakeoverBeat, "at" | "direction">): TakeoverBeat {
  return { human: false, system: false, body: "texte", ...partial };
}

function minutesBefore(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

test("la ligne système est à l’heure de Paris, et le délai est cinq minutes", () => {
  assert.equal(TAKEOVER_IDLE_MS, 5 * 60 * 1000);
  assert.equal(handoffSystemBody(NOW), "Conversation rendue au Concierge à 14h32");
});

test("sans activité humaine depuis 5 minutes, le fil revient au Concierge", () => {
  const fresh = takeoverIdleDue({
    pausedUntil: PAUSE,
    pausedAt: minutesBefore(4),
    beats: [beat({ at: minutesBefore(4), direction: "outbound", human: true, body: "Je m’en occupe." })],
    now: NOW,
  });
  assert.equal(fresh.due, false);
  assert.equal(fresh.reason, "fresh");

  const idle = takeoverIdleDue({
    pausedUntil: PAUSE,
    pausedAt: minutesBefore(6),
    beats: [beat({ at: minutesBefore(6), direction: "outbound", human: true, body: "Je m’en occupe." })],
    now: NOW,
  });
  assert.equal(idle.due, true);
  assert.equal(idle.reason, "idle");
  assert.equal(idle.unansweredText, "");

  const open = takeoverIdleDue({
    pausedUntil: minutesBefore(1),
    pausedAt: minutesBefore(30),
    beats: [],
    now: NOW,
  });
  assert.equal(open.due, false);
  assert.equal(open.reason, "open");
});

test("un message client sans réponse humaine attend 5 minutes", () => {
  const waiting = takeoverIdleDue({
    pausedUntil: PAUSE,
    pausedAt: minutesBefore(20),
    beats: [
      beat({ at: minutesBefore(20), direction: "outbound", human: true, body: "Bonjour" }),
      beat({ at: minutesBefore(3), direction: "inbound", body: "Où est mon vol ?" }),
    ],
    now: NOW,
  });
  assert.equal(waiting.due, false);
  assert.equal(waiting.reason, "waiting");

  const due = takeoverIdleDue({
    pausedUntil: PAUSE,
    pausedAt: minutesBefore(20),
    beats: [
      beat({ at: minutesBefore(20), direction: "outbound", human: true, body: "Bonjour" }),
      beat({ at: minutesBefore(8), direction: "inbound", body: "Où est mon vol ?" }),
      beat({ at: minutesBefore(6), direction: "inbound", body: "Et le transfert ?" }),
      beat({ at: minutesBefore(7), direction: "outbound", system: true, body: "Conversation rendue au Concierge à 14h25" }),
    ],
    now: NOW,
  });
  assert.equal(due.due, true);
  assert.equal(due.reason, "unanswered");
  assert.equal(due.unansweredText, "Où est mon vol ?\nEt le transfert ?");

  const resumed = takeoverIdleDue({
    pausedUntil: PAUSE,
    pausedAt: minutesBefore(2),
    beats: [beat({ at: minutesBefore(30), direction: "inbound", body: "Toujours là ?" })],
    now: NOW,
  });
  assert.equal(resumed.due, false);
  assert.equal(resumed.reason, "fresh");
});

test("une réponse déjà partie empêche un second envoi", () => {
  assert.equal(
    inboundAlreadyHandled([
      beat({ at: minutesBefore(6), direction: "inbound", body: "Bonjour" }),
      beat({ at: minutesBefore(1), direction: "outbound", body: "Le vol est à 18h." }),
    ]),
    true
  );
  assert.equal(
    inboundAlreadyHandled([
      beat({ at: minutesBefore(1), direction: "inbound", body: "Bonjour" }),
    ]),
    false
  );
});

test("un message d’équipe pose un verrou de 12 h, configurable", () => {
  const start = new Date("2026-11-26T06:00:00.000Z");
  assert.equal(DEFAULT_HUMAN_PAUSE_HOURS, 12);
  assert.equal(humanPauseUntil(start, {}).toISOString(), "2026-11-26T18:00:00.000Z");
  assert.equal(humanPauseHours({ WHATSAPP_HUMAN_PAUSE_HOURS: "4" }), 4);
  assert.equal(humanPauseHours({ WHATSAPP_HUMAN_PAUSE_HOURS: "0" }), 12);
  assert.equal(humanPauseHours({ WHATSAPP_HUMAN_PAUSE_HOURS: "99" }), 12);
  const until = humanPauseUntil(start, { WHATSAPP_HUMAN_PAUSE_HOURS: "4" });
  assert.equal(threadIsPaused(until.toISOString(), new Date("2026-11-26T09:00:00.000Z")), true);
  assert.equal(threadIsPaused(until.toISOString(), new Date("2026-11-26T10:00:00.000Z")), false);
});

test("le cron ne lève pas un verrou humain encore ouvert", async () => {
  const updates: unknown[] = [];
  const admin = {
    from() {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        gte() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        update(row: unknown) {
          updates.push(row);
          return api;
        },
        maybeSingle: async () => ({
          data: {
            phone: "+33601020304",
            customer_id: null,
            paused_at: "2026-11-26T06:00:00.000Z",
            paused_until: "2026-11-26T18:00:00.000Z",
          },
          error: null,
        }),
      };
      return api;
    },
  };
  const settled = await settleTakeoverIdle(admin as never, "+33601020304", new Date("2026-11-26T08:00:00.000Z"));
  assert.equal(settled.handled, false);
  assert.equal(updates.length, 0);
});
