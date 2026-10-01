import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  acquirePliantToken,
  emptyPliantTokenMemory,
  PLIANT_TOKEN_LIMIT,
  PLIANT_TOKEN_MISSING,
  PLIANT_TOKEN_REJECTED,
  isPliantTokenFailure,
  pliantDenialUntil,
  pliantStoredDenial,
  pliantTokenBackoffMs,
  pliantTokenExtra,
  pliantTokenFailureMessage,
  pliantTokenStillValid,
  type PliantTokenResponse,
  type PliantTokenSnapshot,
  type PliantTokenStore,
} from "./pliant-auth";

const NOW = Date.parse("2026-09-30T11:15:00.000Z");

test("un jeton reste valable jusqu’à une minute de son expiration", () => {
  assert.equal(pliantTokenStillValid(NOW + 120_000, NOW), true);
  assert.equal(pliantTokenStillValid(NOW + 30_000, NOW), false);
  assert.equal(pliantTokenStillValid(Number.NaN, NOW), false);
});

test("le quota Auth0 et le refus d’identifiant ont un message distinct", () => {
  assert.equal(pliantTokenFailureMessage(429), PLIANT_TOKEN_LIMIT);
  assert.equal(pliantTokenFailureMessage(401), PLIANT_TOKEN_REJECTED);
  assert.equal(pliantTokenFailureMessage(403), PLIANT_TOKEN_REJECTED);
  assert.equal(pliantTokenFailureMessage(500), PLIANT_TOKEN_MISSING);
  assert.equal(isPliantTokenFailure(PLIANT_TOKEN_LIMIT), true);
  assert.equal(isPliantTokenFailure("Pliant n’a pas renvoyé les transactions."), false);
});

test("le quota tient une heure, tout autre échec arrête le parc une minute", () => {
  assert.equal(pliantTokenBackoffMs(401, "30"), 60_000);
  assert.equal(pliantTokenBackoffMs(500, null), 60_000);
  assert.equal(pliantTokenBackoffMs(429, null), 60 * 60 * 1000);
  assert.equal(pliantTokenBackoffMs(429, "120"), 120_000);
  assert.equal(pliantTokenBackoffMs(429, "999999"), 60 * 60 * 1000);
});

test("un blocage expiré ou inconnu ne masque pas une nouvelle demande", () => {
  const active = pliantStoredDenial(
    { token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT, sent: "1" },
    NOW
  );
  assert.equal(active, PLIANT_TOKEN_LIMIT);
  assert.equal(pliantDenialUntil({ token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT }), Date.parse("2026-09-30T12:15:00.000Z"));
  assert.equal(
    pliantStoredDenial(
      { token_denied_until: "2026-09-30T11:00:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT },
      NOW
    ),
    null
  );
  assert.equal(pliantStoredDenial({ token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: "autre" }, NOW), null);
});

test("l’enregistrement du jeton retire le blocage sans effacer le reste", () => {
  const cleared = pliantTokenExtra(
    { token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT, sent: "1" },
    null
  );
  assert.deepEqual(cleared, { sent: "1" });
  const blocked = pliantTokenExtra({ sent: "1" }, { until: "2026-09-30T12:15:00.000Z", message: PLIANT_TOKEN_LIMIT });
  assert.equal(blocked.sent, "1");
  assert.equal(blocked.token_denied_message, PLIANT_TOKEN_LIMIT);
  const unlocked = pliantTokenExtra({ sent: "1", token_refresh_until: "2026-09-30T11:15:20.000Z" }, null);
  assert.deepEqual(unlocked, { sent: "1" });
});

function fleetStore(): PliantTokenStore & { snapshot: () => PliantTokenSnapshot } {
  let row: PliantTokenSnapshot = { accessToken: null, expiresAt: null, extra: {} };
  let claimUntil = 0;
  return {
    snapshot: () => row,
    async read() {
      return { accessToken: row.accessToken, expiresAt: row.expiresAt, extra: row.extra };
    },
    async claim(untilIso) {
      const until = Date.parse(untilIso);
      if (claimUntil > Date.now()) return false;
      claimUntil = until;
      row = { ...row, extra: { ...(row.extra as object), token_refresh_until: untilIso } };
      return true;
    },
    async save(accessToken, expiresAt, extra) {
      row = { accessToken, expiresAt, extra: pliantTokenExtra(extra, null) };
      claimUntil = 0;
    },
    async deny(untilIso, message, extra) {
      row = { ...row, extra: pliantTokenExtra(extra, { until: untilIso, message }) };
      claimUntil = 0;
    },
    async release(extra) {
      row = { ...row, extra: pliantTokenExtra(extra, null) };
      claimUntil = 0;
    },
  };
}

test("vingt demandes en parallèle n’appellent Auth0 qu’une fois", async () => {
  const store = fleetStore();
  let calls = 0;
  let finish: (value: PliantTokenResponse) => void = () => {};
  const pending = new Promise<PliantTokenResponse>((resolve) => {
    finish = resolve;
  });
  const request = () => {
    calls += 1;
    return pending;
  };
  const runs = Array.from({ length: 20 }, () =>
    acquirePliantToken({
      memory: emptyPliantTokenMemory(),
      store,
      request,
      sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
      claimMs: 2_000,
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls, 1);
  finish({ ok: true, accessToken: "jeton-partage", expiresInSec: 86_400 });
  const tokens = await Promise.all(runs);
  assert.ok(tokens.every((token) => token === "jeton-partage"));
  await acquirePliantToken({ memory: emptyPliantTokenMemory(), store, request, claimMs: 200 });
  assert.equal(calls, 1);
});

test("un quota dépassé empêche le passage suivant d’appeler Auth0", async () => {
  const store = fleetStore();
  let calls = 0;
  const request = async () => {
    calls += 1;
    return { ok: false as const, status: 429, retryAfter: null };
  };
  await assert.rejects(() => acquirePliantToken({ memory: emptyPliantTokenMemory(), store, request, claimMs: 300 }), /limite/);
  await assert.rejects(() => acquirePliantToken({ memory: emptyPliantTokenMemory(), store, request, claimMs: 300 }), /limite/);
  assert.equal(calls, 1);
});

test("un jeton déjà gardé ne déclenche aucun appel", async () => {
  const store = fleetStore();
  await store.save("deja", Date.now() + 3_600_000, {});
  let calls = 0;
  const token = await acquirePliantToken({
    memory: emptyPliantTokenMemory(),
    store,
    request: async () => {
      calls += 1;
      return { ok: true, accessToken: "nouveau", expiresInSec: 3600 };
    },
  });
  assert.equal(token, "deja");
  assert.equal(calls, 0);
});

test("le client_credentials Pliant ne vit que derrière le verrou", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const hits: string[] = [];
  for (const dir of ["lib", "app", "components", "scripts"]) {
    const base = path.join(root, dir);
    try {
      if (!statSync(base).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const file of walk(base)) {
      const text = readFileSync(file, "utf8");
      if (
        text.includes("client_credentials") ||
        text.includes("infinnityprodinternal") ||
        text.includes("infinnitystaginginternal")
      ) {
        hits.push(path.relative(root, file));
      }
    }
  }
  assert.deepEqual(hits.sort(), ["lib/crm/pliant.ts"]);
  const gate = readFileSync(path.join(root, "lib/crm/pliant.ts"), "utf8");
  assert.match(gate, /acquirePliantToken/);
  assert.match(gate, /productionOnlySecret/);
  assert.match(gate, /crm_claim_integration_refresh/);
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}
