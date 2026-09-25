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
  liveStayCover,
  planStayNotice,
  stayCoverUrl,
  stayHasPublishedCover,
  stayNoticeLine,
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
  assert.match(plan.body, /Votre séjour à Avoriaz, réservation TB-2026-0004, est dans votre espace\./);
  assert.equal(plan.body.includes("http"), false);
  assert.equal(plan.body.includes("travelba.fr"), false);
  assert.equal(plan.path, `/mon-compte/reservations/${reference}`);
  const variables = conciergeContentVariables({
    template: plan.template,
    buttonSuffix: "c/K7MQ2PX4",
    place: plan.place,
    reference,
    mediaUrl: plan.mediaUrl,
  });
  assert.deepEqual(variables, { "1": "Avoriaz, réservation TB-2026-0004,", "2": "c/K7MQ2PX4" });
  assert.equal(
    stayNoticeLine("Avoriaz", reference),
    "Votre séjour à Avoriaz, réservation TB-2026-0004, est dans votre espace."
  );
  assert.equal(JSON.stringify(variables).includes("mot de passe"), false);
  assert.equal(JSON.stringify(variables).includes("og-concierge"), false);
});

test("sans ville d’arrivée, aucun message séjour", () => {
  assert.equal(
    planStayNotice({
      published: true,
      reference,
      destination: "Paris",
      title: "CDG",
      hasCover: true,
    }),
    null
  );
  assert.equal(
    planStayNotice({
      published: true,
      reference,
      destination: "CDG → ORY",
      title: null,
      hasCover: false,
    }),
    null
  );
  assert.equal(
    conciergeContentVariables({
      template: "sejour_sans_lieu",
      buttonSuffix: "c/K7MQ2PX4",
      mediaUrl: `https://travelba.fr/api/covers/sejour/${reference}`,
    }),
    null
  );
  assert.equal(
    conciergeContentVariables({
      template: "sejour_sans_lieu_texte",
      buttonSuffix: "c/K7MQ2PX4",
    }),
    null
  );
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
  assert.match(plan.body, /Votre séjour à Marrakech, réservation TB-2026-0004, est dans votre espace\./);
  assert.equal(plan.mediaUrl.includes("og-concierge"), false);
  const variables = conciergeContentVariables({
    template: "sejour",
    buttonSuffix: "c/K7MQ2PX4",
    place: plan.place,
    reference,
    mediaUrl: plan.mediaUrl,
  });
  assert.deepEqual(variables, {
    "1": "Marrakech, réservation TB-2026-0004,",
    "2": plan.mediaUrl,
    "3": "c/K7MQ2PX4",
  });
  assert.equal(
    conciergeContentVariables({
      template: "sejour",
      buttonSuffix: "c/K7MQ2PX4",
      place: "Avoriaz",
      reference,
      mediaUrl: "https://travelba.fr/og-concierge.jpg",
    }),
    null
  );
});

test("une couverture en 404 laisse le message en texte", async () => {
  const missing = await liveStayCover(`https://travelba.fr/api/covers/sejour/${reference}`, async () => {
    return new Response(null, { status: 404 });
  });
  assert.equal(missing, null);
  const logo = await liveStayCover("https://travelba.fr/og-concierge.jpg", async () => {
    return new Response("x", { status: 200, headers: { "content-type": "image/jpeg" } });
  });
  assert.equal(logo, null);
  const ok = await liveStayCover(`https://travelba.fr/api/covers/sejour/${reference}`, async () => {
    return new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } });
  });
  assert.equal(ok, `https://travelba.fr/api/covers/sejour/${reference}`);
});

test("plusieurs pièces dans l’heure tiennent dans un seul message", () => {
  const plans = planPiecesNotices({
    published: true,
    reference,
    destination: "CDG → Avoriaz",
    title: "Neige",
    pieces: [
      { id: "a", kind: "flight", at: "2026-09-25T10:00:00.000Z" },
      { id: "b", kind: "flight", at: "2026-09-25T10:10:00.000Z" },
      { id: "c", kind: "hotel", at: "2026-09-25T10:40:00.000Z" },
    ],
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].ids.length, 3);
  assert.equal(plans[0].place, "Avoriaz");
  assert.match(
    plans[0].body,
    /Vos billets et la confirmation d'hôtel sont dans la réservation TB-2026-0004, séjour à Avoriaz\./
  );
  assert.equal(plans[0].body.includes("http"), false);
  const slot = conciergeContentVariables({
    template: plans[0].template,
    buttonSuffix: "c/K7MQ2PX4",
    variable: plans[0].variable,
    place: plans[0].place,
    reference,
  });
  assert.deepEqual(slot, {
    "1": "billets et la confirmation d'hôtel, réservation TB-2026-0004, séjour à Avoriaz,",
    "2": "c/K7MQ2PX4",
  });
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

test("l’hôtel et le transfert nomment la réservation et le séjour", () => {
  const plans = planPiecesNotices({
    published: true,
    reference,
    destination: "Paris · Avoriaz",
    title: "Semaine",
    pieces: [
      { id: "h", kind: "hotel", at: "2026-09-25T10:00:00.000Z" },
      { id: "t", kind: "transfer", at: "2026-09-25T10:15:00.000Z" },
    ],
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].template, "pieces_composees");
  assert.equal(plans[0].place, "Avoriaz");
  assert.match(
    plans[0].body,
    /Votre confirmation d'hôtel et le transfert sont dans la réservation TB-2026-0004, séjour à Avoriaz\./
  );
  assert.equal(/https?:|travelba\.fr/i.test(plans[0].body), false);
  const variables = conciergeContentVariables({
    template: plans[0].template,
    buttonSuffix: "c/K7MQ2PX4",
    variable: plans[0].variable,
    place: plans[0].place,
    reference,
  });
  assert.equal(
    variables?.["1"],
    "confirmation d'hôtel et le transfert, réservation TB-2026-0004, séjour à Avoriaz,"
  );
  assert.equal(variables?.["1"].includes("http"), false);
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
