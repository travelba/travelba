import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizationChannelBlock,
  authorizationClientFields,
  authorizationNoticeCase,
  authorizationPreview,
  authorizationTextTemplate,
} from "./authorization-notice";
import { conciergeContentDrafts, conciergeContentVariables } from "./concierge-notices";
import { whatsappCatalog } from "./whatsapp-catalog";

const PASSPORT = "12AB34567";

test("le cas suit le résultat, sans numéro de passeport", () => {
  assert.equal(authorizationNoticeCase({ status: "introuvable" }), "manquant");
  assert.equal(authorizationNoticeCase({ status: "none" }), "manquant");
  assert.equal(authorizationNoticeCase({ status: "a_verifier" }), null);
  assert.equal(authorizationNoticeCase({ status: "refuse" }), null);
  assert.equal(authorizationNoticeCase({ status: "erreur" }), null);
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-03-01",
      returnOn: "2027-04-02",
    }),
    "expire"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-03-01",
      departureOn: "2027-03-15",
    }),
    "expire"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-08-29",
      returnOn: "2027-04-02",
      departureOn: "2027-03-20",
    }),
    "approuve"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-08-29",
      returnOn: "2027-04-02",
      currentNumber: PASSPORT,
      boundLast3: "000",
    }),
    "ancien_passeport"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-08-29",
      returnOn: "2027-04-02",
      currentNumber: PASSPORT,
      boundLast3: "567",
      currentDocumentId: "nouveau",
      boundDocumentId: "ancien",
    }),
    "ancien_passeport"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-08-29",
      returnOn: "2027-04-02",
      passportIssuedOn: "2026-11-02",
      authorizationOn: "2026-10-01",
    }),
    "ancien_passeport"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-08-29",
      returnOn: "2027-04-02",
      currentNumber: PASSPORT,
      boundLast3: "567",
      passportIssuedOn: "2026-11-02",
      authorizationOn: "2026-10-01",
    }),
    "approuve"
  );
  assert.equal(
    authorizationNoticeCase({
      status: "approuve",
      validUntil: "2027-08-29",
      returnOn: "2027-04-02",
      passportExpires: "2027-03-01",
    }),
    null
  );
});

test("l’aperçu remplit le modèle et ne cite pas le passeport", () => {
  const preview = authorizationPreview({
    kind: "esta",
    notice: "ancien_passeport",
    name: "Camille",
    place: "Avoriaz",
    reference: "TB-2026-0028",
  });
  assert.match(preview || "", /ancien passeport/);
  assert.match(preview || "", /esta\.cbp\.dhs\.gov/);
  assert.match(preview || "", /Avoriaz, réservation TB-2026-0028/);
  assert.match(preview || "", /Le Concierge/);
  assert.doesNotMatch(preview || "", new RegExp(PASSPORT));
  assert.doesNotMatch(preview || "", /mrz/i);

  const approved = authorizationPreview({
    kind: "uk_eta",
    notice: "approuve",
    name: "Camille",
    place: "Londres",
    reference: "TB-2026-0040",
    validUntil: "2028-03-26",
  });
  assert.match(approved || "", /valable jusqu’au 26\/03\/2028/);
  assert.match(approved || "", /couvre tout le séjour/);
  assert.equal(approved?.includes("http"), false);

  const fields = authorizationClientFields({
    kind: "esta",
    status: "introuvable",
    name: "Camille",
    place: "Avoriaz",
    reference: "TB-2026-0028",
    sent: false,
    currentNumber: PASSPORT,
    phone: "+33601020304",
    email: "camille@example.com",
    optInAt: "2026-01-01",
  });
  assert.equal(fields?.canSend, false);
  assert.match(fields?.sendBlock || "", /pas encore approuvé/);
  assert.match(fields?.preview || "", /n’avons pas trouvé d’ESTA/);
  assert.doesNotMatch(JSON.stringify(fields), new RegExp(PASSPORT));
});

test("le bouton exige le téléphone, l’accord et un modèle", () => {
  assert.match(authorizationChannelBlock({ phone: null, email: "a@b.c", textSid: "HX1" }) || "", /téléphone/);
  assert.match(
    authorizationChannelBlock({
      phone: "+33601020304",
      email: "a@b.c",
      optInAt: null,
      textSid: "HX1",
    }) || "",
    /accepté/
  );
  assert.match(
    authorizationChannelBlock({
      phone: "+33601020304",
      email: "a@b.c",
      optInAt: "2026-01-01",
      optOutAt: "2026-02-01",
      textSid: "HX1",
    }) || "",
    /accepté/
  );
  assert.match(
    authorizationChannelBlock({
      phone: "+33601020304",
      email: "a@b.c",
      optInAt: "2026-01-01",
    }) || "",
    /approuvé/
  );
  assert.equal(
    authorizationChannelBlock({
      phone: "+33601020304",
      email: "a@b.c",
      optInAt: "2026-01-01",
      textSid: "HX1",
    }),
    null
  );
  const variables = conciergeContentVariables({
    template: authorizationTextTemplate("esta", "expire"),
    buttonSuffix: "c/K7MQ2PX4",
    place: "Avoriaz",
    reference: "TB-2026-0028",
    variable: "Camille",
    date: "29/08/2027",
  });
  assert.equal(variables?.["1"], "Camille");
  assert.equal(variables?.["3"], "29/08/2027");
  assert.equal(variables?.["4"], "c/K7MQ2PX4");
  assert.equal(
    conciergeContentVariables({
      template: "esta_expire_carte",
      buttonSuffix: "c/K7MQ2PX4",
      place: "Avoriaz",
      reference: "TB-2026-0028",
      variable: PASSPORT,
      date: "29/08/2027",
    }),
    null
  );
});

test("le catalogue montre les huit messages, photo puis repli", () => {
  const group = whatsappCatalog().find((row) => row.id === "esta-eta");
  assert.ok(group);
  assert.equal(group?.title, "ESTA et ETA Royaume-Uni");
  assert.equal(group?.messages.length, 8);
  for (const message of group?.messages || []) {
    assert.equal(message.wired, true);
    assert.match(message.bubble.image || "", /\/whatsapp\/visa\.jpg$/);
    assert.equal(message.fallback?.photo, false);
    assert.match(message.when, /séjour|passeport|retour|valable|cours/i);
    assert.equal(message.bubble.body.includes("{{"), false);
    assert.doesNotMatch(message.bubble.body, /\d{6,}/);
  }
  const names = new Set(conciergeContentDrafts().map((draft) => draft.friendlyName));
  for (const message of group?.messages || []) {
    assert.equal(names.has(message.bubble.modelName || ""), true);
    assert.equal(names.has(message.fallback?.modelName || ""), true);
  }
});
