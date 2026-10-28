import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conciergeContentDrafts,
  conciergeContentSid,
  conciergeContentVariables,
  travellerFormalityBody,
  travellerFormalityMessage,
  travellerFormalityVariables,
  conciergeExemplars,
  conciergePhotoTemplate,
  noticeCardTemplate,
  pieceCardTemplate,
  PIECES_PATH,
  planFormalityReady,
  passportExpirySentence,
  planMissingPieceNotices,
  planPiecesNotices,
  generatedStayPhotoId,
  liveStayCover,
  planStayNotice,
  STAY_COVER_WAIT_LIMIT,
  stayCoverUrl,
  stayHasPublishedCover,
  stayNoticeDispatch,
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
  assert.equal(stayCoverUrl(reference, true, { shareCode: "ABCDEFGH" })?.includes("token"), false);
  assert.equal(stayCoverUrl(reference, true), null);
  assert.equal(stayCoverUrl(reference, true, { shareCode: "pas-un-code" }), null);
  assert.equal(stayCoverUrl(reference, true, { entryCode: "pas-un-code" }), null);
  assert.equal(
    stayCoverUrl(reference, true, { entryCode: "K7MQ2PX4", shareCode: "ABCDEFGH" }),
    `https://travelba.fr/api/covers/sejour/${reference}?e=K7MQ2PX4`
  );
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
  assert.deepEqual(variables, { "1": "à Avoriaz, réservation TB-2026-0004,", "2": "c/K7MQ2PX4" });
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

test("la couverture publiée est une URL HTTPS portée par le code du lien, pas une signed URL", () => {
  // Au moment du plan, le lien du message n’existe pas encore : la photo est résolue à l’envoi.
  const planned = planStayNotice({
    published: true,
    reference,
    destination: "Paris · Marrakech",
    title: "Week-end",
    hasCover: true,
  });
  assert.ok(planned);
  assert.equal(planned.mediaUrl, null);
  assert.equal(planned.template, "sejour");
  const shared = planStayNotice({
    published: true,
    reference,
    destination: "Paris · Marrakech",
    title: "Week-end",
    hasCover: true,
    coverAccess: { shareCode: "ABCDEFGH" },
  });
  assert.equal(shared?.mediaUrl, `https://travelba.fr/api/covers/sejour/${reference}?partage=ABCDEFGH`);
  const plan = planStayNotice({
    published: true,
    reference,
    destination: "Paris · Marrakech",
    title: "Week-end",
    hasCover: true,
    coverAccess: { entryCode: "K7MQ2PX4" },
  });
  assert.ok(plan);
  assert.equal(plan.place, "à Marrakech");
  assert.equal(plan.mediaUrl, `https://travelba.fr/api/covers/sejour/${reference}?e=K7MQ2PX4`);
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
    "1": "à Marrakech, réservation TB-2026-0004,",
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

test("une nouvelle réservation attend la photo et le modèle illustré", () => {
  assert.equal(generatedStayPhotoId({ destination: "Bordeaux", title: "Séjour", cover_image_path: null }), "photo-city-bordeaux");
  assert.equal(generatedStayPhotoId({ destination: "Valmorel", title: "Valmorel", cover_image_path: null }), "photo-city-valmorel");
  assert.equal(generatedStayPhotoId({ destination: "Avoriaz", title: "Neige", cover_image_path: null }), null);
  assert.equal(
    generatedStayPhotoId({ destination: "Bordeaux", title: "Séjour", cover_image_path: "bookings/x/cover.webp" }),
    null
  );
  assert.equal(
    stayNoticeDispatch({ hasCover: false, coverReady: false, templateReady: false, waits: 0 }),
    "text"
  );
  assert.equal(
    stayNoticeDispatch({ hasCover: true, coverReady: false, templateReady: true, waits: 0 }),
    "wait"
  );
  assert.equal(
    stayNoticeDispatch({ hasCover: true, coverReady: true, templateReady: false, waits: 0 }),
    "wait"
  );
  assert.equal(
    stayNoticeDispatch({ hasCover: true, coverReady: true, templateReady: true, waits: 0 }),
    "photo"
  );
  assert.equal(
    stayNoticeDispatch({ hasCover: true, coverReady: false, templateReady: false, waits: STAY_COVER_WAIT_LIMIT }),
    "text"
  );
  assert.equal(
    stayNoticeDispatch({ hasCover: true, coverReady: true, templateReady: true, waits: STAY_COVER_WAIT_LIMIT }),
    "photo"
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
  assert.equal(plans[0].place, "à Avoriaz");
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
  assert.equal(plans[0].place, "à Avoriaz");
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
    visaOffered: true,
  });
  const quiet = planMissingPieceNotices({
    published: true,
    reference,
    bookingId: "booking",
    startDate: "2026-10-02",
    today: "2026-09-25",
    missingPassports: 1,
    formalities: [{ name: "ETA-IL", filed: false }],
    alreadySent: { passport: false, formalityNames: [] },
  });
  assert.equal(quiet.length, 1);
  assert.equal(quiet.some((row) => row.template === "formalite_manquante"), false);
  assert.equal(missing.length, 2);
  assert.equal(missing[0].path, PIECES_PATH);
  assert.match(missing[0].body, /Déposez-le dans vos pièces/);
  assert.equal(missing[1].path, `/mon-compte/reservations/${reference}`);
  assert.match(missing[1].body, /Votre ETA-IL manque avant le départ/);
  assert.equal(missing.some((row) => row.body.includes("%")), false);
});

test("un passeport qui expire avant le retour a son propre message", () => {
  assert.equal(
    passportExpirySentence("Jonas", "2027-02-07", "2027-03-28"),
    "Le passeport de Jonas expire le 07/02/2027, avant votre retour du 28/03/2027. Pensez à le renouveler."
  );
  assert.equal(passportExpirySentence("Jonas", "pas-une-date", "2027-03-28"), null);
  const plans = planMissingPieceNotices({
    published: true,
    reference,
    bookingId: "booking",
    startDate: "2027-03-01",
    today: "2026-10-28",
    missingPassports: 0,
    expiringPassports: [
      { travelerId: "jonas", givenName: "Jonas", expiresOn: "2027-02-07", returnOn: "2027-03-28" },
    ],
    formalities: [],
    alreadySent: { passport: false, formalityNames: [] },
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].template, "passeport_expire");
  assert.equal(plans[0].dedupe, "passeport-expire:booking:jonas");
  assert.notEqual(plans[0].dedupe, "passeport:booking");
  assert.match(plans[0].body, /Le passeport de Jonas expire le 07\/02\/2027, avant votre retour du 28\/03\/2027/);
  assert.equal(plans[0].body.includes("manque"), false);
  const variables = conciergeContentVariables({
    template: "passeport_expire",
    buttonSuffix: "c/K7MQ2PX4",
    givenName: plans[0].givenName,
    date: plans[0].date,
    variable: plans[0].variable,
  });
  assert.deepEqual(variables, {
    "1": "Jonas",
    "2": "07/02/2027",
    "3": "28/03/2027",
    "4": "c/K7MQ2PX4",
  });
  const again = planMissingPieceNotices({
    published: true,
    reference,
    bookingId: "booking",
    startDate: "2027-03-01",
    today: "2026-10-28",
    missingPassports: 0,
    expiringPassports: [
      { travelerId: "jonas", givenName: "Jonas", expiresOn: "2027-02-07", returnOn: "2027-03-28" },
    ],
    formalities: [],
    alreadySent: { passport: true, formalityNames: [], expiringTravelerIds: ["jonas"] },
  });
  assert.equal(again.length, 0);
  const absent = planMissingPieceNotices({
    published: true,
    reference,
    bookingId: "booking",
    startDate: "2027-03-01",
    today: "2026-10-28",
    missingPassports: 1,
    formalities: [],
    alreadySent: { passport: false, formalityNames: [] },
  });
  assert.equal(absent[0].dedupe, "passeport:booking");
  assert.match(absent[0].body, /Le passeport manque avant le départ/);
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

test("la photo du lieu est sur la carte, le texte reste le repli", () => {
  const exemplars = conciergeExemplars();
  assert.ok(exemplars.length >= 14);
  const names = new Set<string>();
  let withPhoto = 0;
  for (const draft of exemplars) {
    assert.equal(names.has(draft.friendlyName), false);
    names.add(draft.friendlyName);
    const card = draft.create.types["whatsapp/card"] as
      | { body: string; media: string[]; actions: { type: string; title: string; url: string }[] }
      | undefined;
    const text = draft.create.types["twilio/call-to-action"] as
      | { body: string; actions: { type: string; title: string; url: string }[] }
      | undefined;
    const body = card?.body || text?.body || "";
    const action = (card || text)?.actions?.[0];
    assert.ok(action);
    assert.equal((card || text)?.actions.length, 1);
    assert.equal(action.type, "URL");
    assert.ok(action.title.length > 0);
    assert.ok(action.title.length <= 25);
    assert.equal(action.url, "https://travelba.fr/e/{{" + action.url.match(/\{\{(\d+)\}\}/)?.[1] + "}}");
    assert.equal(/https?:|travelba\.fr/i.test(body), false);
    assert.match(body, /Le Concierge/);
    assert.equal(JSON.stringify(draft.create).includes("og-concierge"), false);
    assert.equal(JSON.stringify(draft.create).includes("tba-mark"), false);
    if (card) {
      assert.equal(card.media.length, 1);
      assert.match(card.media[0], /^\{\{\d+\}\}$/);
      const sampleCover = Object.values(draft.create.variables).find(
        (value) => String(value).includes("/api/covers/sejour/") || String(value).includes("/whatsapp/")
      );
      // Échantillon Meta : une illustration statique du site. La couverture d’un vrai
      // dossier exige son code de partage et ne sert plus d’exemple.
      assert.match(String(sampleCover), /\/whatsapp\/[a-z]+\.jpg$/);
      assert.equal(String(sampleCover).includes("/api/covers/sejour/"), false);
      withPhoto += 1;
    } else {
      assert.ok(text);
      assert.equal(JSON.stringify(draft.create).includes("/api/covers/"), false);
      assert.equal(JSON.stringify(draft.create).includes("/whatsapp/"), false);
      assert.match(body, /séjour/);
    }
  }
  assert.ok(withPhoto > 1);
  assert.equal(
    conciergeContentDrafts().some((draft) => JSON.stringify(draft.create).includes("og-concierge")),
    false
  );
});

test("hôtel, vol, transfert et formalité nomment le séjour, sans photo", () => {
  const cover = "https://travelba.fr/api/covers/sejour/TB-2026-0004";
  assert.equal(
    pieceCardTemplate({ template: "piece", variable: "confirmation d'hôtel" }),
    "piece_hotel"
  );
  assert.equal(pieceCardTemplate({ template: "piece", variable: "billet" }), "piece_vol");
  assert.equal(pieceCardTemplate({ template: "piece", variable: "transfert" }), "piece_transfert");
  assert.equal(pieceCardTemplate({ template: "piece", variable: "pièce" }), "document");
  assert.equal(
    pieceCardTemplate({
      template: "pieces_composees",
      variable: "billet, la confirmation d'hôtel et le transfert",
    }),
    "pieces_regroupees"
  );
  assert.equal(pieceCardTemplate({ template: "piece", variable: "assurance" }), null);
  assert.equal(noticeCardTemplate("passeport"), "passeport_carte");
  assert.equal(noticeCardTemplate("formalite_prete"), "formalite_prete_carte");
  assert.equal(noticeCardTemplate("formalite_manquante"), "formalite_manquante_carte");
  const hotel = conciergeContentVariables({
    template: "piece_hotel",
    buttonSuffix: "c/K7MQ2PX4",
    place: "Avoriaz",
    reference,
    mediaUrl: cover,
  });
  assert.equal(hotel?.["1"], "à Avoriaz, réservation TB-2026-0004,");
  assert.equal(hotel?.["2"], "c/K7MQ2PX4");
  assert.equal(hotel?.["3"], undefined);
  assert.equal(JSON.stringify(hotel).includes("/api/covers/"), false);
  assert.equal(conciergePhotoTemplate("piece_hotel"), "piece_hotel_photo");
  const hotelJpg = "https://travelba.fr/whatsapp/hotel.jpg";
  const hotelPhoto = conciergeContentVariables({
    template: "piece_hotel_photo",
    buttonSuffix: "c/K7MQ2PX4",
    place: "Avoriaz",
    reference,
    mediaUrl: hotelJpg,
  });
  assert.equal(hotelPhoto?.["1"], "à Avoriaz, réservation TB-2026-0004,");
  assert.equal(hotelPhoto?.["2"], hotelJpg);
  assert.equal(hotelPhoto?.["3"], "c/K7MQ2PX4");
  assert.equal(
    conciergeContentVariables({
      template: "piece_hotel_photo",
      buttonSuffix: "c/K7MQ2PX4",
      place: "Avoriaz",
      reference,
      mediaUrl: cover,
    }),
    null
  );
  assert.equal(
    conciergeContentVariables({
      template: "piece_hotel_photo",
      buttonSuffix: "c/K7MQ2PX4",
      place: "Avoriaz",
      reference,
      mediaUrl: null,
    }),
    null
  );
  const esta = conciergeContentVariables({
    template: "formalite_prete_carte",
    buttonSuffix: "c/K7MQ2PX4",
    variable: "ESTA",
    place: "Avoriaz",
    reference,
    mediaUrl: cover,
  });
  assert.equal(esta?.["1"], "ESTA");
  assert.equal(esta?.["2"], "à Avoriaz, réservation TB-2026-0004,");
  assert.equal(esta?.["3"], "c/K7MQ2PX4");
  assert.equal(esta?.["4"], undefined);
  const invite = conciergeContentVariables({
    template: "connexion_carte",
    buttonSuffix: "c/K7MQ2PX4",
    variable: "Voyageur",
    place: "Avoriaz",
    reference,
  });
  assert.equal(invite?.["1"], "Voyageur");
  assert.equal(invite?.["2"].includes("http"), false);
  assert.equal(invite?.["3"], "c/K7MQ2PX4");
  const stay = conciergeContentVariables({
    template: "sejour",
    buttonSuffix: "c/K7MQ2PX4",
    place: "Avoriaz",
    reference,
    mediaUrl: cover,
  });
  assert.equal(stay?.["2"], cover);
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

test("la formalité du voyageur n’a ni bouton ni lien", () => {
  const draft = conciergeContentDrafts().find((row) => row.template === "formalite_prete_voyageur");
  assert.ok(draft);
  assert.equal(draft?.env, "TWILIO_CONTENT_FORMALITE_PRETE_VOYAGEUR");
  const types = draft?.create.types as Record<string, { body?: string; actions?: unknown[] }>;
  assert.equal(types["twilio/call-to-action"], undefined);
  assert.equal(types["whatsapp/card"], undefined);
  assert.equal(types["twilio/text"]?.actions, undefined);
  assert.equal(types["twilio/text"]?.body, travellerFormalityBody());
  assert.equal(/https?:|travelba\.fr|\{\{/.test(travellerFormalityBody().replace(/\{\{\d+\}\}/g, "")), false);
  assert.match(travellerFormalityBody(), /Travel Business Agency/);
  const variables = travellerFormalityVariables({
    firstName: "Léa",
    formality: "ETA-IL",
    reference: "TB-2026-0082",
    startDate: "2026-06-04",
    endDate: "2026-06-11",
  });
  assert.ok(variables);
  const body = travellerFormalityMessage(variables || {});
  assert.match(body, /Bonjour Léa/);
  assert.match(body, /Votre ETA-IL pour le séjour TB-2026-0082, du 4 juin 2026 au 11 juin 2026 est prête/);
  assert.equal(body.includes("http"), false);
  assert.equal(noticeCardTemplate("formalite_prete_voyageur"), null);
  assert.equal(
    travellerFormalityVariables({ firstName: "Léa", formality: "https://evil", reference: "TB-2026-0082" }),
    null
  );
});
