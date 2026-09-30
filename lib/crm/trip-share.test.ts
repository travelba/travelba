import assert from "node:assert/strict";
import test from "node:test";
import {
  companionsForShare,
  isTripShareCode,
  isTripShareUrl,
  planTripShareSend,
  publicTripItems,
  sendTripShareWhatsapp,
  storedCompanionPhone,
  tripShareAllowsPath,
  tripShareCode,
  tripShareMessage,
  tripShareUrl,
} from "./trip-share";

test("le code du voyage est court et le lien n’ouvre pas le compte", () => {
  const code = tripShareCode();
  assert.equal(isTripShareCode(code), true);
  assert.equal(code.length, 8);
  const url = tripShareUrl("https://travelba.fr", code);
  assert.equal(url, `https://travelba.fr/v/${code}`);
  assert.equal(isTripShareUrl(url), true);
  assert.equal(url.includes("/e/"), false);
  assert.equal(url.includes("/mon-compte"), false);
  assert.equal(isTripShareUrl("https://travelba.fr/e/ABCDEFGH"), false);
  assert.equal(isTripShareUrl("https://travelba.fr/mon-compte"), false);
});

test("le message WhatsApp porte la page du voyage, pas l’espace client", () => {
  const url = "https://travelba.fr/v/ABCDEFGH";
  const text = tripShareMessage({ firstName: "Camille", title: "Marrakech", url });
  assert.match(text, /^Bonjour Camille,/);
  assert.match(text, /Voici le voyage Marrakech\./);
  assert.match(text, /travelba\.fr\/v\/ABCDEFGH/);
  assert.match(text, /Travel Business Agency/);
  assert.equal(text.includes("/mon-compte"), false);
  assert.equal(text.includes("/e/"), false);
  assert.equal(text.includes("espace"), false);
});

test("la page publique garde l’itinéraire et écarte frais, facture et formalité", () => {
  const items = publicTripItems([
    { kind: "hotel", visible_to_client: true },
    { kind: "flight", visible_to_client: true },
    { kind: "fee", visible_to_client: true },
    { kind: "expense", visible_to_client: true },
    { kind: "insurance", visible_to_client: true },
    { kind: "visa", visible_to_client: true },
    { kind: "chauffeur", visible_to_client: true },
    { kind: "hotel", visible_to_client: false },
  ]);
  assert.deepEqual(
    items.map((item) => item.kind),
    ["hotel", "flight", "chauffeur"]
  );
});

test("le lien ne sert que les pièces publiées de ce dossier", () => {
  const booking = { id: "11111111-1111-1111-1111-111111111111", cover_image_path: "bookings/11111111-1111-1111-1111-111111111111/cover.webp" };
  const docs = [
    { storage_path: "bookings/11111111-1111-1111-1111-111111111111/billet.pdf", visible_to_client: true },
    { storage_path: "bookings/11111111-1111-1111-1111-111111111111/brouillon.pdf", visible_to_client: false },
  ];
  assert.equal(tripShareAllowsPath(booking.cover_image_path, booking, docs), true);
  assert.equal(tripShareAllowsPath(docs[0].storage_path, booking, docs), true);
  assert.equal(tripShareAllowsPath(docs[1].storage_path, booking, docs), false);
  assert.equal(tripShareAllowsPath("customers/c1/passeport.jpg", booking, docs), false);
  assert.equal(
    tripShareAllowsPath("bookings/22222222-2222-2222-2222-222222222222/billet.pdf", booking, docs),
    false
  );
  assert.equal(tripShareAllowsPath("../customers/c1/passeport.jpg", booking, docs), false);
});

test("le voyageur principal voit les accompagnateurs, pas lui-même", () => {
  const rows = companionsForShare(
    [
      {
        id: "t-holder",
        companion_id: null,
        is_account_holder: true,
        first_name: "Ada",
        last_name: "Martin",
      },
      {
        id: "t-camille",
        companion_id: "c-camille",
        is_account_holder: false,
        first_name: "Camille",
        last_name: "Martin",
      },
      {
        id: "t-leo",
        companion_id: "c-leo",
        is_account_holder: false,
        first_name: "Léo",
        last_name: "Martin",
      },
    ],
    [
      { id: "c-camille", first_name: "Camille", last_name: "Martin", phone: "+33601020304" },
      { id: "c-leo", first_name: "Léo", last_name: "Martin", phone: null },
    ]
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.hasPhone, true);
  assert.equal(rows[1]?.hasPhone, false);
  assert.equal(rows.some((row) => row.firstName === "Ada"), false);
});

test("sans téléphone, l’envoi ne part pas", () => {
  const travelers = [{ companion_id: "c1", is_account_holder: false }];
  const missing = planTripShareSend({
    companionId: "c1",
    travelers,
    companions: [{ id: "c1", first_name: "Léo", phone: "" }],
  });
  assert.deepEqual(missing, { ok: false, reason: "no_phone" });
  const stranger = planTripShareSend({
    companionId: "autre",
    travelers,
    companions: [{ id: "c1", first_name: "Léo", phone: "+33601020304" }],
  });
  assert.deepEqual(stranger, { ok: false, reason: "not_on_trip" });
  const holder = planTripShareSend({
    companionId: "c1",
    travelers: [{ companion_id: "c1", is_account_holder: true }],
    companions: [{ id: "c1", first_name: "Ada", phone: "+33601020304" }],
  });
  assert.deepEqual(holder, { ok: false, reason: "not_on_trip" });
});

test("un clic envoie le lien par le WhatsApp de l’agence, sans appel si le numéro manque", async () => {
  let calls = 0;
  const skipped = await sendTripShareWhatsapp({
    phone: "",
    firstName: "Léo",
    title: "Marrakech",
    url: "https://travelba.fr/v/ABCDEFGH",
    fetchImpl: async () => {
      calls += 1;
      return new Response("no");
    },
  });
  assert.equal(skipped.ok, false);
  assert.equal(calls, 0);

  const refused = await sendTripShareWhatsapp({
    phone: "+33601020304",
    firstName: "Camille",
    title: "Marrakech",
    url: "https://travelba.fr/mon-compte/reservations/TBA-1",
    fetchImpl: async () => {
      calls += 1;
      return new Response("no");
    },
  });
  assert.equal(refused.ok, false);
  assert.equal(calls, 0);
});

test("le message part du numéro Business, avec le lien /v/", async () => {
  const previous = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_WHATSAPP_FROM,
  };
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
  try {
    let body = "";
    const result = await sendTripShareWhatsapp({
      phone: "+33601020304",
      firstName: "Camille",
      title: "Marrakech",
      url: "https://travelba.fr/v/ABCDEFGH",
      fetchImpl: async (_url, init) => {
        body = String(init?.body || "");
        return new Response(JSON.stringify({ sid: "SMTEST" }), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    const params = new URLSearchParams(body);
    assert.equal(params.get("From"), "whatsapp:+33756841315");
    assert.equal(params.get("To"), "whatsapp:+33601020304");
    assert.match(params.get("Body") || "", /https:\/\/travelba\.fr\/v\/ABCDEFGH/);
    assert.equal(params.get("MediaUrl"), null);
    assert.equal((params.get("Body") || "").includes("/mon-compte"), false);

    body = "";
    const stayPhoto = await sendTripShareWhatsapp({
      phone: "+33601020304",
      firstName: "Camille",
      title: "Marrakech",
      url: "https://travelba.fr/v/ABCDEFGH",
      mediaUrl: "https://travelba.fr/api/covers/sejour/TB-2026-0004",
      fetchImpl: async (_url, init) => {
        body = String(init?.body || "");
        return new Response(JSON.stringify({ sid: "SMTEST2" }), { status: 200 });
      },
    });
    assert.equal(stayPhoto.ok, true);
    assert.equal(new URLSearchParams(body).get("MediaUrl"), null);

    body = "";
    const illustrated = await sendTripShareWhatsapp({
      phone: "+33601020304",
      firstName: "Camille",
      title: "Marrakech",
      url: "https://travelba.fr/v/ABCDEFGH",
      mediaUrl: "https://travelba.fr/whatsapp/partage.jpg",
      fetchImpl: async (_url, init) => {
        body = String(init?.body || "");
        return new Response(JSON.stringify({ sid: "SMTEST3" }), { status: 200 });
      },
    });
    assert.equal(illustrated.ok, true);
    assert.equal(new URLSearchParams(body).get("MediaUrl"), "https://travelba.fr/whatsapp/partage.jpg");
    assert.equal((params.get("Body") || "").includes("+336"), false);
  } finally {
    if (previous.sid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = previous.sid;
    if (previous.token === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = previous.token;
    if (previous.from === undefined) delete process.env.TWILIO_WHATSAPP_FROM;
    else process.env.TWILIO_WHATSAPP_FROM = previous.from;
  }
});

test("un téléphone d’accompagnateur est stocké en E.164 ou refusé", () => {
  assert.deepEqual(storedCompanionPhone(""), { ok: true, phone: null });
  assert.deepEqual(storedCompanionPhone("+33 6 01 02 03 04"), { ok: true, phone: "+33601020304" });
  assert.deepEqual(storedCompanionPhone("123"), { ok: false });
});
