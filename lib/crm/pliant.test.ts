import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { emptyPliantCardControls } from "./pliant-controls";
import { issuePliantCard, PliantSecretsError, readIssuedPliantCardSecrets, readPliantCardholderName, readPliantCardSecrets, readPliantHealth } from "./pliant";
import { maskPliantPath, scrubPliantLog } from "./pliant-tx";

const ORG = "11111111-1111-4111-8111-111111111111";
const HOLDER = "22222222-2222-4222-8222-222222222222";
const PAN = "4242424242424242";

test("le chemin masque les identifiants et le corps retire PAN et cryptogramme", () => {
  assert.equal(
    maskPliantPath(`/cardholders/${ORG}?organizationId=${ORG}&status=ACTIVE`),
    "/cardholders/:id?organizationId=:id&status=ACTIVE"
  );
  assert.equal(maskPliantPath(`/card-details/${ORG}`), "/card-details/:id");
  assert.equal(maskPliantPath("/card-details/card-agency-1"), "/card-details/:id");
  const body = scrubPliantLog(
    `{"errorCode":"VALIDATION","message":"organizationId is required","pan":"${PAN}","cvc":"123"} ${"x".repeat(400)}`
  );
  assert.equal(body.includes(PAN), false);
  assert.equal(body.includes("4242"), false);
  assert.equal(body.includes('"123"'), false);
  assert.equal(body.length <= 300, true);
  assert.match(body, /organizationId is required/);
});

describe("lectures Pliant", { concurrency: 1 }, () => {
  const previous = {
    sandbox: process.env.PLIANT_SANDBOX,
    id: process.env.PLIANT_CLIENT_ID,
    secret: process.env.PLIANT_CLIENT_SECRET,
    org: process.env.PLIANT_ORGANIZATION_ID,
    holder: process.env.PLIANT_CARDHOLDER_ID,
    vercel: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const calls: { url: string; method: string }[] = [];
  const logs: unknown[][] = [];
  let restoreFetch: (() => void) | null = null;
  const originalError = console.error;

  function install(mode: "holder-400" | "holder-ok" | "org-400" | "issue") {
    calls.length = 0;
    logs.length = 0;
    const prior = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      calls.push({ url, method });
      if (url.includes("pliant-test.supabase.co")) {
        if (url.includes("/rpc/crm_claim_integration_refresh")) return Response.json(true);
        if (url.includes("/crm_integrations") && method === "GET") return Response.json([]);
        if (url.includes("/crm_integrations")) return Response.json(null, { status: 201 });
        return Response.json(null);
      }
      if (url.includes("/oauth/token")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (url.includes("getpliant.com") && !url.includes("sandbox")) throw new Error("production Pliant");
      if (mode === "org-400" && url.includes(`/organizations/${ORG}`)) {
        return Response.json({ errorCode: "VALIDATION", message: "organizationId is required", pan: PAN }, { status: 400 });
      }
      if (url.includes("/organizations")) return Response.json({ data: [{ organizationId: ORG }] });
      if (url.includes("/cards/available-cards")) {
        return Response.json({ cardConfigs: [{ cardConfig: "PLIANT_SINGLE_USE", canBeIssued: true, type: "SINGLE_USE" }] });
      }
      if (url.includes("/cardholders?")) return Response.json({ data: [{ cardholderId: HOLDER }] });
      if (url.includes(`/cardholders/${HOLDER}`) && method === "GET") {
        if (mode === "holder-400") {
          return Response.json({ errorCode: "VALIDATION", message: "organizationId is required", pan: PAN, cvc: "123" }, { status: 400 });
        }
        return Response.json({ firstName: "Andrea", lastName: "Martin" });
      }
      if (url.includes(`/cards/${HOLDER}`) && method === "POST") return Response.json({ cardId: "card-1", status: "ACTIVE" });
      if (url.includes("/card-controls") && method === "PUT") return new Response(null, { status: 200 });
      if (url.includes("/card-controls") && method === "GET") return Response.json(emptyPliantCardControls());
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    restoreFetch = () => {
      globalThis.fetch = prior;
      console.error = originalError;
    };
  }

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("PLIANT_SANDBOX", previous.sandbox);
    restore("PLIANT_CLIENT_ID", previous.id);
    restore("PLIANT_CLIENT_SECRET", previous.secret);
    restore("PLIANT_ORGANIZATION_ID", previous.org);
    restore("PLIANT_CARDHOLDER_ID", previous.holder);
    restore("VERCEL_ENV", previous.vercel);
    restore("NEXT_PUBLIC_SUPABASE_URL", previous.supabaseUrl);
    restore("SUPABASE_SERVICE_ROLE_KEY", previous.serviceRole);
  });

  function arm() {
    delete process.env.VERCEL_ENV;
    process.env.PLIANT_SANDBOX = "1";
    process.env.PLIANT_CLIENT_ID = "pliant-test";
    process.env.PLIANT_CLIENT_SECRET = "pliant-secret";
    process.env.PLIANT_ORGANIZATION_ID = ORG;
    process.env.PLIANT_CARDHOLDER_ID = HOLDER;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pliant-test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  }

  test("un porteur vide est une raison, pas un silence", async () => {
    const read = await readPliantCardholderName("  ");
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.reason, "Porteur non configuré");
  });

  test("GET porteur 400 journalise méthode, chemin masqué, statut et corps, et renvoie la raison", async () => {
    arm();
    install("holder-400");
    const read = await readPliantCardholderName(HOLDER);
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.match(read.reason, /400/);
    assert.match(read.reason, /organizationId is required/);
    assert.equal(read.reason.includes(PAN), false);
    assert.equal(read.reason.includes(ORG), false);
    assert.equal(read.reason.includes(HOLDER), false);
    const asked = calls.find((call) => call.url.includes(`/cardholders/${HOLDER}`) && call.method === "GET");
    assert.match(asked?.url || "", new RegExp(`organizationId=${ORG}`));
    const line = logs.find((entry) => entry[0] === "[pliant]" && entry[1] === "GET" && entry[3] === 400);
    assert.ok(line, "journal HTTP absent");
    assert.equal(line?.[2], `/cardholders/:id?organizationId=:id`);
    assert.equal(String(line?.[4]).includes(PAN), false);
    assert.equal(String(line?.[4]).includes(ORG), false);
    assert.match(String(line?.[4]), /organizationId is required/);
  });

  test("un nom lisible passe, et la liste des porteurs envoie organizationId, status et page", async () => {
    arm();
    install("issue");
    const read = await readPliantCardholderName(HOLDER);
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.firstName, "Andrea");
    assert.equal(read.lastName, "Martin");
    const issued = await issuePliantCard(HOLDER, {
      organizationId: ORG,
      limit: { value: 1000, currency: "EUR" },
      transactionLimit: { value: 1000, currency: "EUR" },
      validFrom: "2026-11-05",
      validTo: "2026-11-08",
    });
    assert.equal(issued.cardId, "card-1");
    const list = calls.find((call) => call.url.includes("/cardholders?") && call.method === "GET");
    assert.match(list?.url || "", new RegExp(`organizationId=${ORG}`));
    assert.match(list?.url || "", /status=ACTIVE/);
    assert.match(list?.url || "", /page=0/);
    assert.match(list?.url || "", /limit=100/);
  });

  test("une organisation illisible est un échec de santé, sans identifiant", async () => {
    arm();
    install("org-400");
    const health = await readPliantHealth();
    assert.equal(health.ok, false);
    if (health.ok) return;
    assert.match(health.reason, /Organisation illisible/);
    assert.match(health.reason, /400/);
    assert.equal(health.reason.includes(PAN), false);
    assert.equal(health.reason.includes(ORG), false);
  });

  const CARD = "33333333-3333-4333-8333-333333333333";
  const pciLogs: unknown[][] = [];

  function pciArm(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    pciLogs.length = 0;
    delete process.env.VERCEL_ENV;
    process.env.PLIANT_SANDBOX = "1";
    process.env.PLIANT_CLIENT_ID = "pliant-test";
    process.env.PLIANT_CLIENT_SECRET = "pliant-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pliant-test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    const prior = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("pliant-test.supabase.co")) {
        if (url.includes("/rpc/crm_claim_integration_refresh")) return Response.json(true);
        if (url.includes("/crm_integrations") && (init?.method || "GET") === "GET") return Response.json([]);
        return Response.json(null, { status: 201 });
      }
      if (url.includes("/oauth/token")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (url.includes("getpliant.com") && !url.includes("sandbox")) throw new Error("production Pliant");
      return handler(url, init);
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      pciLogs.push(args);
    };
    return () => {
      globalThis.fetch = prior;
      console.error = originalError;
    };
  }

  test("GET /card-details n’envoie pas organizationId et journalise statut et chemin", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const restore = pciArm((url, init) => {
      seen.push({ url, headers: new Headers(init?.headers) });
      return Response.json({ message: "not ready", pan: PAN, cvv: "123" }, { status: 404 });
    });
    try {
      await assert.rejects(() => readPliantCardSecrets(CARD), (err: unknown) => err instanceof PliantSecretsError && err.status === 404 && err.incomplete === false);
      assert.equal(seen.length, 1);
      const asked = new URL(seen[0].url);
      assert.equal(asked.origin, "https://pci-sandbox.partner-api.getpliant.com");
      assert.equal(asked.pathname, `/card-details/${CARD}`);
      assert.equal(asked.search, "");
      assert.equal(seen[0].headers.get("accept"), "application/json");
      assert.equal(seen[0].headers.get("Pliant-API-Version"), "2.1.0");
      assert.match(seen[0].headers.get("authorization") || "", /^Bearer /);
      assert.equal(seen[0].headers.get("organizationId"), null);
      const line = pciLogs.find((entry) => entry[0] === "[pliant]" && entry[1] === "secrets");
      assert.deepEqual(line, ["[pliant]", "secrets", 404, "/card-details/:id"]);
      assert.equal(JSON.stringify(pciLogs).includes(PAN), false);
      assert.equal(JSON.stringify(pciLogs).includes(CARD), false);
      assert.equal(JSON.stringify(pciLogs).includes("123"), false);
    } finally {
      restore();
    }
  });

  test("404, 409 et un corps incomplet se relisent", async () => {
    const waits: number[] = [];
    const steps = ["404", "409", "incomplete", "ok"] as const;
    let reads = 0;
    const restore = pciArm(() => {
      const step = steps[reads] ?? "ok";
      reads += 1;
      if (step === "incomplete") return Response.json({ pan: "12" });
      if (step === "ok") return Response.json({ pan: PAN, cvv: "123", expiryMonth: 12, expiryYear: 2030 });
      return Response.json({ message: "not ready", pan: PAN, cvv: "123" }, { status: Number(step) });
    });
    try {
      const secrets = await readIssuedPliantCardSecrets(CARD, {
        sleep: async (ms) => {
          waits.push(ms);
        },
        read: readPliantCardSecrets,
      });
      assert.equal(secrets.pan, PAN);
      assert.equal(secrets.cvc, "123");
      assert.deepEqual(waits, [1000, 2000, 4000]);
      assert.equal(reads, 4);
      const secretLogs = pciLogs.filter((entry) => entry[0] === "[pliant]" && entry[1] === "secrets");
      assert.equal(secretLogs.length, 3);
      assert.equal(JSON.stringify(secretLogs).includes(PAN), false);
      assert.equal(JSON.stringify(secretLogs).includes("123"), false);
      assert.equal(JSON.stringify(secretLogs).includes(CARD), false);
    } finally {
      restore();
    }
  });

  test("un 400 n’est pas relancé", async () => {
    let reads = 0;
    const waits: number[] = [];
    const restore = pciArm(() => {
      reads += 1;
      return Response.json({ message: "bad", pan: PAN }, { status: 400 });
    });
    try {
      await assert.rejects(
        () => readIssuedPliantCardSecrets(CARD, { sleep: async (ms) => { waits.push(ms); } }),
        (err: unknown) => err instanceof PliantSecretsError && err.status === 400
      );
      assert.equal(reads, 1);
      assert.deepEqual(waits, []);
      assert.equal(JSON.stringify(pciLogs).includes(PAN), false);
      assert.ok(pciLogs.some((entry) => entry[1] === "secrets" && entry[2] === 400));
    } finally {
      restore();
    }
  });
});
