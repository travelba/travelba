import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conciergeContentDrafts,
  conciergeContentSid,
  conciergeContentVariables,
  PIECES_PATH,
  planFormalityReady,
  planMissingPieceNotices,
  planPiecesNotices,
  planStayNotice,
  stayCoverUrl,
  stayHasPublishedCover,
} from "./concierge-notices";
import { sendContentTemplate } from "./whatsapp";

const reference = "TB-2026-0004";

test("un séjour non publié ne part pas", () => {
  const plan = planStayNotice({
    published: false,
    reference,
    destination: "Avoriaz",
    title: "Neige",
    hasCover: true,
  });
  assert.equal(plan, null);
  assert.equal(stayCoverUrl(reference, true)?.includes("token"), false);
  assert.equal(
    planPiecesNotices({
      published: false,
      reference,
      pieces: [
        { id: "a", kind: "flight", at: "2026-09-25T10:00:00.000Z" },
        { id: "b", kind: "hotel", at: "2026-09-25T10:20:00.000Z" },
      ],
    }).length,
    0
  );
  assert.equal(
    planMissingPieceNotices({
      published: false,
      reference,
      bookingId: "booking",
      startDate: "2026-10-01",
      today: "2026-09-25",
      missingPassports: 1,
      formalities: [],
      alreadySent: { passport: false, formalityNames: [] },
    }).length,
    0
  );
  assert.equal(planFormalityReady({ published: false, formality: "ESTA" }), null);
});

test("sans couverture, le séjour part sans image", () => {
  assert.equal(
    stayHasPublishedCover({ destination: "Lieu inconnu zzz", title: "zzz", cover_image_path: null }),
    false
  );
  const plan = planStayNotice({
    published: true,
    reference,
    destination: "Avoriaz",
    title: "Neige",
    hasCover: false,
  });
  assert.ok(plan);
  assert.equal(plan.mediaUrl, null);
  assert.equal(plan.template, "sejour_texte");
  assert.match(plan.body, /Votre séjour à Avoriaz est dans votre espace\./);
  assert.equal(plan.path, `/mon-compte/reservations/${reference}`);
  assert.equal(plan.path.startsWith("/mon-compte/reservations/"), true);
  const variables = conciergeContentVariables({
    template: plan.template,
    buttonSuffix: "c/K7MQ2PX4",
    place: plan.place,
    mediaUrl: plan.mediaUrl,
  });
  assert.deepEqual(variables, { "1": "Avoriaz", "2": "c/K7MQ2PX4" });
  assert.equal(JSON.stringify(variables).includes("mot de passe"), false);
});

test("la couverture publiée est une URL HTTPS, pas une signed URL", () => {
  const plan = planStayNotice({
    published: true,
    reference,
    destination: "Paris · Marrakech",
    title: "Week-end",
    hasCover: true,
  });
  assert.ok(plan);
  assert.equal(plan.place, "Marrakech");
  assert.equal(plan.mediaUrl, `https://travelba.fr/api/covers/sejour/${reference}`);
  assert.match(plan.mediaUrl, /^https:\/\//);
  assert.equal(/token=|supabase\.co/i.test(plan.mediaUrl), false);
  assert.equal(plan.template, "sejour");
});

test("plusieurs pièces dans l’heure tiennent dans un seul message", () => {
  const plans = planPiecesNotices({
    published: true,
    reference,
    pieces: [
      { id: "a", kind: "flight", at: "2026-09-25T10:00:00.000Z" },
      { id: "b", kind: "flight", at: "2026-09-25T10:10:00.000Z" },
      { id: "c", kind: "hotel", at: "2026-09-25T10:40:00.000Z" },
    ],
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].ids.length, 3);
  assert.match(plans[0].body, /Vos billets et la confirmation d'hôtel sont dans la réservation\./);
  assert.equal(plans[0].path, `/mon-compte/reservations/${reference}`);
  assert.equal(plans[0].body.includes("%"), false);
  const later = planPiecesNotices({
    published: true,
    reference,
    pieces: [
      { id: "a", kind: "flight", at: "2026-09-25T10:00:00.000Z" },
      { id: "d", kind: "hotel", at: "2026-09-25T12:30:00.000Z" },
    ],
  });
  assert.equal(later.length, 2);
});

test("la formalité terminée nomme la pièce, sans pourcentage", () => {
  const ready = planFormalityReady({ published: true, formality: "ESTA" });
  assert.ok(ready);
  assert.match(ready.body, /Votre ESTA est dans vos pièces\./);
  assert.equal(ready.path, PIECES_PATH);
  assert.equal(ready.body.includes("%"), false);
  const missing = planMissingPieceNotices({
    published: true,
    reference,
    bookingId: "booking",
    startDate: "2026-10-02",
    today: "2026-09-25",
    missingPassports: 1,
    formalities: [{ name: "ETA-IL", filed: false }],
    alreadySent: { passport: false, formalityNames: [] },
  });
  assert.equal(missing.length, 2);
  assert.equal(missing[0].path, PIECES_PATH);
  assert.match(missing[0].body, /Déposez-le dans vos pièces/);
  assert.equal(missing[1].path, `/mon-compte/reservations/${reference}`);
  assert.match(missing[1].body, /Votre ETA-IL manque avant le départ/);
  assert.equal(missing.some((row) => row.body.includes("%")), false);
});

test("les modèles n’embarquent aucun SID", () => {
  for (const draft of conciergeContentDrafts()) {
    assert.equal(JSON.stringify(draft.create).includes("HX"), false);
    assert.equal(conciergeContentSid(draft.template), "");
  }
  const previous = process.env.TWILIO_CONTENT_SEJOUR;
  process.env.TWILIO_CONTENT_SEJOUR = "HXexemple";
  try {
    assert.equal(conciergeContentSid("sejour"), "HXexemple");
  } finally {
    if (previous === undefined) delete process.env.TWILIO_CONTENT_SEJOUR;
    else process.env.TWILIO_CONTENT_SEJOUR = previous;
  }
});

test("sans SID approuvé, Twilio n’est pas appelé", async () => {
  const previous = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_WHATSAPP_FROM,
  };
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
  try {
    let called = false;
    const result = await sendContentTemplate({
      phone: "+33601020304",
      contentSid: "",
      variables: { "1": "Avoriaz", "2": "c/K7MQ2PX4" },
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      },
    });
    assert.equal(called, false);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_configured");
  } finally {
    for (const [key, value] of Object.entries({
      TWILIO_ACCOUNT_SID: previous.sid,
      TWILIO_AUTH_TOKEN: previous.token,
      TWILIO_WHATSAPP_FROM: previous.from,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
