import assert from "node:assert/strict";
import test from "node:test";
import { padDuration, rateLimit, rateLimitAll, rateLimitKey, rateWindow, requestIp } from "./rate-limit";

test("la clé est stable, bornée, et ne contient ni l’e-mail ni l’IP", () => {
  const key = rateLimitKey("otp:email", "  Marie@Example.com ");
  assert.equal(key, rateLimitKey("otp:email", "marie@example.com"));
  assert.notEqual(key, rateLimitKey("otp:ip", "marie@example.com"));
  assert.match(key, /^otp:email:[0-9a-f]{32}$/);
  assert.equal(key.includes("marie"), false);
  assert.equal(rateLimitKey("otp:ip", "").endsWith(rateLimitKey("otp:ip", "unknown").split(":")[2]), true);
});

test("la fenêtre compte les tentatives puis repart de 1 une fois passée", () => {
  const start = new Date("2026-10-04T12:00:00.000Z");
  const first = rateWindow({ hits: 0, windowStartedAt: null, now: start, limit: 5, windowSeconds: 900 });
  assert.deepEqual(first, { allowed: true, hits: 1, windowStartedAt: start });
  const fifth = rateWindow({ hits: 4, windowStartedAt: start, now: new Date(start.getTime() + 60_000), limit: 5, windowSeconds: 900 });
  assert.equal(fifth.allowed, true);
  assert.equal(fifth.hits, 5);
  const sixth = rateWindow({ hits: 5, windowStartedAt: start, now: new Date(start.getTime() + 120_000), limit: 5, windowSeconds: 900 });
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.hits, 6);
  const later = new Date(start.getTime() + 900_000);
  const fresh = rateWindow({ hits: 6, windowStartedAt: start, now: later, limit: 5, windowSeconds: 900 });
  assert.deepEqual(fresh, { allowed: true, hits: 1, windowStartedAt: later });
});

test("la RPC décide ; une erreur laisse passer", async () => {
  const calls: unknown[] = [];
  const denying = {
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      return { data: false, error: null };
    },
  } as never;
  assert.equal(await rateLimit({ key: "k", limit: 5, windowSeconds: 900 }, denying), false);
  assert.deepEqual(calls[0], ["crm_rate_limit_hit", { p_key: "k", p_limit: 5, p_window_seconds: 900 }]);
  const allowing = { rpc: async () => ({ data: true, error: null }) } as never;
  assert.equal(await rateLimit({ key: "k", limit: 5, windowSeconds: 900 }, allowing), true);
  const broken = { rpc: async () => ({ data: null, error: { message: "function does not exist" } }) } as never;
  assert.equal(await rateLimit({ key: "k", limit: 5, windowSeconds: 900 }, broken), true);
  let seen = 0;
  const mixed = {
    rpc: async (_name: string, args: { p_key: string }) => {
      seen += 1;
      return { data: args.p_key !== "ip", error: null };
    },
  } as never;
  assert.equal(
    await rateLimitAll(
      [
        { key: "email", limit: 5, windowSeconds: 900 },
        { key: "ip", limit: 20, windowSeconds: 900 },
      ],
      mixed
    ),
    false
  );
  assert.equal(seen, 2);
});

test("le délai minimal et l’adresse du client", async () => {
  const started = Date.now();
  await padDuration(started, 30);
  assert.ok(Date.now() - started >= 29);
  assert.equal(requestIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
  assert.equal(requestIp(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(requestIp(new Headers()), "unknown");
});
