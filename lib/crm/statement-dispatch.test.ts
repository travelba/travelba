import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { McpWriteError } from "./mcp-write";
import { runWithMcpAccess } from "./mcp-auth";
import { envoyerReleve } from "./mcp-statement";
import {
  sendAccountStatement,
  statementBotId,
  statementChannelOf,
  statementRecentSendBlocks,
  STATEMENT_REPEAT_WINDOW_MS,
  type RecentStatementSend,
  type StatementSendDeps,
} from "./statement-dispatch";
import type { StatementDeliveryResult } from "./statement-whatsapp";
import type { CrmCustomer } from "./types";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-27T15:00:00.000Z");
const supabase = {} as SupabaseClient;

function customer(): CrmCustomer {
  return {
    id: CUSTOMER_ID,
    first_name: "Camille",
    phone: "+33601020304",
    whatsapp_opt_out_at: null,
  } as CrmCustomer;
}

function recent(minutesAgo: number, status = "sent", sid: string | null = "SMdeja"): RecentStatementSend {
  return {
    at: new Date(NOW.getTime() - minutesAgo * 60 * 1000).toISOString(),
    status,
    sid,
  };
}

function deps(extra?: {
  recent?: RecentStatementSend | null;
  deliver?: StatementSendDeps["deliver"];
  limit?: boolean;
  missing?: boolean;
  readCode?: "not_found" | "read";
}) {
  const calls = { read: 0, build: 0, deliver: 0, recent: 0, limit: 0, botId: null as string | null, staffId: null as string | null };
  const harness: StatementSendDeps = {
    readCustomer: async () => {
      calls.read += 1;
      if (extra?.missing || extra?.readCode === "not_found") {
        return { ok: false, httpStatus: 404, message: "Client introuvable.", code: "not_found" };
      }
      if (extra?.readCode === "read") {
        return { ok: false, httpStatus: 500, message: "Lecture impossible.", code: "read" };
      }
      return { ok: true, customer: customer() };
    },
    buildPdf: async () => {
      calls.build += 1;
      return { pdf: new Uint8Array([1]), member: false };
    },
    findRecent: async () => {
      calls.recent += 1;
      return extra?.recent === undefined ? null : extra.recent;
    },
    limit: async () => {
      calls.limit += 1;
      return extra?.limit !== false;
    },
    deliver: extra?.deliver ?? (async (input) => {
      calls.deliver += 1;
      calls.botId = input.botId ?? null;
      calls.staffId = input.staffId ?? null;
      return { ok: true, message: "Relevé envoyé sur le WhatsApp du client.", sid: "SMneuf", statut: "sent" };
    }),
  };
  return { calls, harness };
}

test("le canal vide est WhatsApp, l’e-mail est reconnu, le reste est refusé", () => {
  assert.equal(statementChannelOf(undefined), "whatsapp");
  assert.equal(statementChannelOf("  "), "whatsapp");
  assert.equal(statementChannelOf("WhatsApp"), "whatsapp");
  assert.equal(statementChannelOf("email"), "email");
  assert.equal(statementChannelOf("courrier"), "invalid");
  assert.equal(statementBotId("MCP"), "mcp");
  assert.equal(statementBotId("pas un jeton"), "mcp");
});

test("un envoi réussi dans les cinq minutes bloque, la borne exacte laisse passer", () => {
  assert.equal(statementRecentSendBlocks(recent(4), NOW, STATEMENT_REPEAT_WINDOW_MS, false), true);
  assert.equal(statementRecentSendBlocks(recent(5), NOW, STATEMENT_REPEAT_WINDOW_MS, false), false);
  assert.equal(statementRecentSendBlocks(recent(1), NOW, STATEMENT_REPEAT_WINDOW_MS, true), false);
  assert.equal(statementRecentSendBlocks(recent(1, "failed"), NOW, STATEMENT_REPEAT_WINDOW_MS, false), false);
  assert.equal(statementRecentSendBlocks(null, NOW, STATEMENT_REPEAT_WINDOW_MS, false), false);
});

test("l’e-mail ne prépare pas le PDF et n’appelle pas WhatsApp", async () => {
  const { calls, harness } = deps();
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      channel: "email",
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, false);
  assert.equal(result.statut, "refused");
  assert.equal(result.code, "email");
  assert.equal(result.twilio_sid, null);
  assert.match(result.message, /e-mail/);
  assert.equal(calls.read, 0);
  assert.equal(calls.deliver, 0);
});

test("le bot envoie comme l’agence et la réponse porte le SID", async () => {
  const { calls, harness } = deps();
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      repeatWindowMs: STATEMENT_REPEAT_WINDOW_MS,
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, true);
  assert.equal(result.statut, "sent");
  assert.equal(result.twilio_sid, "SMneuf");
  assert.equal(calls.deliver, 1);
  assert.equal(calls.build, 1);
  assert.equal(calls.botId, "mcp");
  assert.equal(calls.staffId, null);
});

test("le clic agence est attribué au collaborateur et peut renvoyer", async () => {
  const { calls, harness } = deps({ recent: recent(1) });
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "staff", staffId: "44444444-4444-4444-8444-444444444444" },
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, true);
  assert.equal(calls.recent, 0);
  assert.equal(calls.staffId, "44444444-4444-4444-8444-444444444444");
  assert.equal(calls.botId, null);
});

test("un second envoi réussi dans les cinq minutes est refusé, sans nouveau message", async () => {
  const { calls, harness } = deps({ recent: recent(2, "delivered", "SMdeja") });
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      repeatWindowMs: STATEMENT_REPEAT_WINDOW_MS,
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "duplicate");
  assert.equal(result.statut, "refused");
  assert.equal(result.httpStatus, 409);
  assert.equal(result.twilio_sid, "SMdeja");
  assert.match(result.message, /force/);
  assert.equal(calls.deliver, 0);
  assert.equal(calls.build, 0);
});

test("force renvoie malgré un envoi récent", async () => {
  const { calls, harness } = deps({ recent: recent(1) });
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      force: true,
      repeatWindowMs: STATEMENT_REPEAT_WINDOW_MS,
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, true);
  assert.equal(result.twilio_sid, "SMneuf");
  assert.equal(calls.recent, 0);
  assert.equal(calls.deliver, 1);
});

test("un échec récent ne bloque pas le nouvel envoi", async () => {
  const { calls, harness } = deps({ recent: recent(1, "failed", null) });
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      repeatWindowMs: STATEMENT_REPEAT_WINDOW_MS,
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, true);
  assert.equal(calls.deliver, 1);
});

test("un échec Twilio reste en journal côté livraison et renvoie le statut", async () => {
  const failed: StatementDeliveryResult = {
    ok: false,
    status: 502,
    message: "WhatsApp n’a pas pu remettre le relevé. Téléchargez-le.",
    code: "twilio",
    sid: null,
    statut: "failed",
  };
  const { calls, harness } = deps();
  harness.deliver = async () => {
    calls.deliver += 1;
    return failed;
  };
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      repeatWindowMs: STATEMENT_REPEAT_WINDOW_MS,
      now: NOW,
    },
    harness
  );
  assert.equal(result.ok, false);
  assert.equal(result.statut, "failed");
  assert.equal(result.twilio_sid, null);
  assert.equal(result.code, "twilio");
  assert.equal(calls.deliver, 1);
});

test("envoyer_releve renvoie le SID, le statut et le jeton", async () => {
  const { calls, harness } = deps();
  const result = await runWithMcpAccess({ actor: "mcp", passport: false, cards: false }, () =>
    envoyerReleve({ customer_id: CUSTOMER_ID }, supabase, harness)
  );
  assert.equal(result.ok, true);
  assert.equal(result.statut, "sent");
  assert.equal(result.twilio_sid, "SMneuf");
  assert.equal(result.auteur, "mcp");
  assert.equal(result.canal, "whatsapp");
  assert.equal(calls.botId, "mcp");
  assert.equal(calls.staffId, null);
});

test("envoyer_releve refuse le doublon et l’e-mail", async () => {
  const doubled = deps({
    recent: {
      at: new Date(Date.now() - 60 * 1000).toISOString(),
      status: "sent",
      sid: "SMdeja",
    },
  });
  const duplicate = await envoyerReleve({ customer_id: CUSTOMER_ID }, supabase, doubled.harness);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.statut, "refused");
  assert.equal(duplicate.twilio_sid, "SMdeja");
  assert.equal(doubled.calls.deliver, 0);

  const mailed = deps();
  const email = await envoyerReleve({ customer_id: CUSTOMER_ID, channel: "email" }, supabase, mailed.harness);
  assert.equal(email.ok, false);
  assert.equal(email.canal, "email");
  assert.equal(email.twilio_sid, null);
  assert.equal(mailed.calls.deliver, 0);
});

test("envoyer_releve refuse un client inconnu ou mal saisi", async () => {
  await assert.rejects(() => envoyerReleve({ customer_id: "pas-un-id" }, supabase, deps().harness), McpWriteError);
  const { harness } = deps({ missing: true });
  await assert.rejects(() => envoyerReleve({ customer_id: CUSTOMER_ID }, supabase, harness), (err: unknown) => {
    assert.ok(err instanceof McpWriteError);
    assert.match(err.message, /introuvable/);
    return true;
  });
});

test("la limite horaire s’applique avant l’envoi", async () => {
  const { calls, harness } = deps({ limit: false });
  const result = await sendAccountStatement(
    {
      supabase,
      customerId: CUSTOMER_ID,
      audience: "staff",
      actor: { kind: "bot", id: "mcp" },
      now: NOW,
    },
    harness
  );
  assert.equal(result.code, "rate");
  assert.equal(result.httpStatus, 429);
  assert.equal(calls.deliver, 0);
  assert.equal(calls.build, 0);
});
