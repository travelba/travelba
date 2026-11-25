import assert from "node:assert/strict";
import { test } from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore } from "./whatsapp-inbound";
import { adminTodoLines } from "./admin-todo";
import { buildConciergeAlert } from "./whatsapp-alert";
import { planPhase2 } from "./concierge-phase2";
import {
  HANDOFF_LABELS,
  buildConciergeDossier,
  isServiceQuote,
  planConciergeTurn,
  weekdayDateClash,
} from "./whatsapp-concierge";

const NOW = new Date("2026-11-23T10:00:00Z");
const ASK =
  "Bonjour, Est ce qu'il est possible d'avoir un tarif pour un vol Paris Nice pour moi et mon épouse dimanche 21 avril ?";

const nice = {
  id: "stay-nice",
  reference: "TB-2026-0901",
  title: "Nice",
  destination: "Nice",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  currency: "EUR",
  total_amount: 4000,
  visible_to_client: true,
  prices_visible: false,
  cover_image_path: null,
  notes_client: null,
  share_code: null,
};

function benjamin() {
  return buildConciergeDossier({
    firstName: "Benjamin",
    bookings: [nice, { ...nice, id: "stay-rome", reference: "TB-2026-0902", title: "Rome", destination: "Rome" }],
    balances: [{ currency: "EUR", balance: -5615 }],
  });
}

test("le verbe avoir ne déclenche pas l’encours, l’avoir comptable oui", () => {
  const dossier = benjamin();
  assert.equal(isServiceQuote(ASK), true);
  const quote = planConciergeTurn(ASK, dossier, NOW, []);
  assert.equal(quote.handoff, "quote");
  assert.equal(/5\s?615|à régler|encours/i.test(quote.text), false);

  const credit = planConciergeTurn("Quel est mon avoir ?", dossier, NOW, []);
  assert.equal(credit.handoff, null);
  assert.match(credit.text, /à régler|avoir/i);
  const balance = planConciergeTurn("Quel est mon encours ?", dossier, NOW, []);
  assert.equal(balance.handoff, null);
  assert.match(balance.text, /à régler/);
  const several = planConciergeTurn("Quel est le prix du séjour ?", dossier, NOW, []);
  assert.equal(several.handoff, null);
  assert.match(several.text, /Lequel vous intéresse/);
  const one = planConciergeTurn(
    "Quel est le prix du séjour ?",
    buildConciergeDossier({ firstName: "Benjamin", bookings: [nice], balances: [{ currency: "EUR", balance: -5615 }] }),
    NOW,
    []
  );
  assert.equal(one.handoff, null);
  assert.match(one.text, /pas ce prix/i);
});

test("un tarif de vol est un devis, avec le jour qui ne tombe pas", () => {
  const clash = weekdayDateClash(ASK, NOW);
  assert.equal(clash?.date, "2027-04-21");
  assert.equal(clash?.cited, "dimanche");
  assert.equal(clash?.actual, "mercredi");
  assert.equal(weekdayDateClash("mercredi 21 avril", NOW), null);

  const turn = planConciergeTurn(ASK, benjamin(), NOW, []);
  assert.equal(turn.handoff, "quote");
  assert.equal((turn.messages || []).length, 1);
  assert.match(turn.text, /Un chiffrage arrive très rapidement/);
  assert.match(turn.text, /Je transmets à l’agence/);
  assert.match(turn.text, /21 avril 2027 est un mercredi, pas un dimanche/);
  assert.match(turn.text, /Lequel dois-je retenir/);
  assert.match(turn.text, /Le Concierge/);
  assert.equal(/parle à Benjamin|Benjamin/i.test(turn.text), false);
  assert.equal(/pas ce prix|Lequel vous intéresse|TB-2026-0901|Pour quelle destination/i.test(turn.text), false);
  assert.equal(turn.cover, null);

  for (const message of ["tarif pour un vol", "prix d'un vol", "combien pour un transfert samedi"]) {
    assert.equal(planConciergeTurn(message, benjamin(), NOW, []).handoff, "quote", message);
  }
});

test("une contestation revient au devis, pas à « je n’ai pas cette information »", () => {
  const history = [
    { direction: "inbound" as const, body: ASK, at: "2026-11-23T09:00:00.000Z" },
    {
      direction: "outbound" as const,
      body: "Il vous reste 5 615,00 € à régler.\nhttps://travelba.fr/mon-compte/transactions",
      at: "2026-11-23T09:01:00.000Z",
    },
  ];
  for (const message of ["Pourquoi tu me parles de ça ?", "Ça n'a rien à voir", "Je ne vous ai pas demandé ça"]) {
    const turn = planConciergeTurn(message, benjamin(), NOW, history);
    assert.equal(turn.handoff, "quote", message);
    assert.match(turn.text, /Pardon/, message);
    assert.match(turn.text, /chiffrage/, message);
    assert.match(turn.text, /l’agence/, message);
    assert.equal(/n’ai pas cette information|parle à Benjamin|5\s?615/i.test(turn.text), false, message);
  }
});

test("le devis passe tel quel, le questionnaire d’un nouveau séjour reste", async () => {
  const phase = await planPhase2({
    phone: "+33601020304",
    message: ASK,
    dossier: benjamin(),
    now: NOW,
  });
  assert.equal(phase.turn.handoff, "quote");
  assert.match(phase.turn.text, /chiffrage/);
  assert.equal(phase.turn.text.includes("Pour quelle destination"), false);
  assert.equal(phase.proposal, null);

  const discovery = await planPhase2({
    phone: "+33601020304",
    message: "Je voudrais un devis pour un nouveau séjour",
    dossier: benjamin(),
    now: NOW,
  });
  assert.equal(discovery.turn.handoff, "quote");
  assert.match(discovery.turn.text, /Pour quelle destination/);
});

test("la demande et l’alerte portent le besoin, pour un devis comme pour une question", async () => {
  const quoteMail = buildConciergeAlert({
    kind: "quote",
    body: ASK,
    customerId: "cust-1",
    bookingId: null,
    phone: "+33601020304",
    to: "contact@travelba.fr",
  });
  assert.match(quoteMail?.subject || "", new RegExp(HANDOFF_LABELS.quote));
  assert.match(quoteMail?.text || "", /dimanche 21 avril/);
  assert.match(quoteMail?.html || "", /admin\/clients\/cust-1/);
  const questionMail = buildConciergeAlert({
    kind: "question",
    body: ASK,
    customerId: "cust-1",
    bookingId: null,
    phone: "+33601020304",
    to: "contact@travelba.fr",
  });
  assert.match(questionMail?.subject || "", /Question à l’agence/);
  assert.match(questionMail?.text || "", /Paris Nice/);
  const todo = adminTodoLines({ whatsapp: 1, paymentLinks: 0, visas: 0, checkins: 0 });
  assert.match(todo.find((line) => line.id === "whatsapp")?.label || "", /demande WhatsApp/);

  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const alerts: { kind?: string; body?: string }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: ASK,
    MessageSid: "SMdevis",
  };
  const store: WhatsappStore = {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return [{ id: "cust-1", first_name: "Benjamin" }];
    },
    async loadDossier() {
      return {
        bookings: [nice, { ...nice, id: "stay-rome", reference: "TB-2026-0902", title: "Rome", destination: "Rome" }],
        balances: [{ currency: "EUR", balance: -5615 }],
      };
    },
    async insertMessage(row) {
      writes.push({ table: "crm_whatsapp_messages", row: row as unknown as Record<string, unknown> });
      return { id: "m1" };
    },
    async insertRequest(row) {
      writes.push({ table: "crm_whatsapp_requests", row: row as unknown as Record<string, unknown> });
    },
  };
  const token = "twilio-test-token";
  const url = "https://travelba.fr/api/webhooks/twilio/whatsapp";
  await receiveWhatsappWebhook({
    url,
    signature: twilioRequestSignature(token, url, params),
    params,
    authToken: token,
    autoreply: true,
    now: NOW,
    store,
    alert: async (row) => {
      alerts.push({ kind: row.kind, body: row.body });
    },
    send: async () => ({ ok: true, sid: "SMout" }),
  });
  const request = writes.find((write) => write.table === "crm_whatsapp_requests");
  assert.equal(request?.row?.kind, "quote");
  assert.match(String(request?.row?.body), /dimanche 21 avril/);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.kind, "quote");
  assert.match(alerts[0]?.body || "", /pour moi et mon épouse/);
});
