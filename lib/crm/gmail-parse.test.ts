import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BILLET_AVION_LABEL,
  BILLET_BACKFILL_DONE,
  buildGmailHistorySearchParams,
  collectAttachments,
  collectBodyText,
  collectHistoryMessageIds,
  decodeGmailPushBody,
  extractEmailAddress,
  gmailLabelMatchKey,
  headerValue,
  htmlToText,
  matchGmailLabelIds,
  mergeGmailLabelNames,
  nextBilletBackfillCursor,
  parseGmailMessage,
  type RawGmailMessage,
} from "./gmail-parse";

function b64url(text: string) {
  return Buffer.from(text, "utf8").toString("base64url");
}

describe("extractEmailAddress", () => {
  it("extrait l'adresse d'un en-tête From nommé", () => {
    assert.equal(
      extractEmailAddress("Little Emperors <reservations@little-emperors.com>"),
      "reservations@little-emperors.com"
    );
  });
  it("accepte une adresse brute", () => {
    assert.equal(extractEmailAddress("agent@expedia.com"), "agent@expedia.com");
  });
});

describe("htmlToText", () => {
  it("convertit les blocs et entités en texte", () => {
    const out = htmlToText(
      "<p>Booking&nbsp;Reference: 123</p><p>Guest&amp;Co</p><style>x{}</style>"
    );
    assert.match(out, /Booking Reference: 123/);
    assert.match(out, /Guest&Co/);
    assert.doesNotMatch(out, /x\{\}/);
  });
});

describe("headerValue", () => {
  it("est insensible à la casse", () => {
    const headers = [{ name: "subject", value: "Confirmation" }];
    assert.equal(headerValue(headers, "Subject"), "Confirmation");
  });
});

describe("collectBodyText", () => {
  it("préfère text/plain", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Bonjour PNR ABC123") } },
        { mimeType: "text/html", body: { data: b64url("<p>ignore</p>") } },
      ],
    };
    assert.equal(collectBodyText(payload), "Bonjour PNR ABC123");
  });
  it("dérive du HTML si pas de texte", () => {
    const payload = {
      mimeType: "text/html",
      body: { data: b64url("<p>Ref: XYZ</p>") },
    };
    assert.match(collectBodyText(payload), /Ref: XYZ/);
  });
});

describe("collectAttachments", () => {
  it("ne retient que les parties avec attachmentId + filename", () => {
    const payload = {
      parts: [
        { mimeType: "text/plain", body: { data: b64url("corps") } },
        {
          mimeType: "application/pdf",
          filename: "voucher.pdf",
          body: { attachmentId: "att-1", size: 1024 },
        },
        { mimeType: "application/pdf", body: { attachmentId: "no-name" } },
      ],
    };
    const atts = collectAttachments(payload);
    assert.equal(atts.length, 1);
    assert.equal(atts[0].filename, "voucher.pdf");
    assert.equal(atts[0].attachmentId, "att-1");
  });
});

describe("parseGmailMessage", () => {
  it("lit sujet, expéditeur, corps et pièces jointes imbriquées", () => {
    const raw: RawGmailMessage = {
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["Label_1"],
      internalDate: "1770000000000",
      payload: {
        headers: [
          { name: "From", value: "Little Emperors <res@little-emperors.com>" },
          { name: "Subject", value: "Booking confirmation" },
        ],
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: b64url("Guest Test — ref 97620170") } },
            ],
          },
          {
            mimeType: "application/pdf",
            filename: "confirmation.pdf",
            body: { attachmentId: "att-9", size: 2048 },
          },
        ],
      },
    };
    const parsed = parseGmailMessage(raw);
    assert.equal(parsed.id, "msg-1");
    assert.equal(parsed.subject, "Booking confirmation");
    assert.equal(parsed.fromEmail, "res@little-emperors.com");
    assert.match(parsed.text, /97620170/);
    assert.equal(parsed.attachments.length, 1);
    assert.equal(parsed.attachments[0].filename, "confirmation.pdf");
    assert.ok(parsed.receivedAt);
  });
});

describe("buildGmailHistorySearchParams", () => {
  it("demande messageAdded et labelAdded (params répétés)", () => {
    const params = buildGmailHistorySearchParams("100", { labelId: "Label_LE" });
    assert.equal(params.get("startHistoryId"), "100");
    assert.equal(params.get("labelId"), "Label_LE");
    assert.deepEqual(params.getAll("historyTypes"), ["messageAdded", "labelAdded"]);
  });
  it("ajoute le pageToken si fourni", () => {
    const params = buildGmailHistorySearchParams("100", { pageToken: "p2" });
    assert.equal(params.get("pageToken"), "p2");
    assert.equal(params.get("labelId"), null);
  });
});

describe("collectHistoryMessageIds", () => {
  it("recueille un mail nouveau (messageAdded)", () => {
    const ids = collectHistoryMessageIds([
      { messagesAdded: [{ message: { id: "msg-new", labelIds: ["Label_LE"] } }] },
    ]);
    assert.deepEqual(ids, ["msg-new"]);
  });
  it("recueille un mail existant auquel on applique un label (labelsAdded)", () => {
    const ids = collectHistoryMessageIds(
      [
        {
          labelsAdded: [
            {
              message: { id: "msg-old", labelIds: ["INBOX", "Label_LE"] },
              labelIds: ["Label_LE"],
            },
          ],
        },
      ],
      "Label_LE"
    );
    assert.deepEqual(ids, ["msg-old"]);
  });
  it("ignore un labelsAdded qui ne concerne pas le label suivi", () => {
    const ids = collectHistoryMessageIds(
      [
        {
          labelsAdded: [
            {
              message: { id: "msg-starred", labelIds: ["INBOX", "STARRED"] },
              labelIds: ["STARRED"],
            },
          ],
        },
      ],
      "Label_LE"
    );
    assert.deepEqual(ids, []);
  });
  it("déduplique un mail à la fois nouveau et labellisé", () => {
    const ids = collectHistoryMessageIds([
      {
        messagesAdded: [{ message: { id: "msg-both" } }],
        labelsAdded: [{ message: { id: "msg-both" }, labelIds: ["Label_LE"] }],
      },
    ]);
    assert.deepEqual(ids, ["msg-both"]);
  });
  it("renvoie une liste vide sans historique", () => {
    assert.deepEqual(collectHistoryMessageIds(undefined), []);
    assert.deepEqual(collectHistoryMessageIds([]), []);
  });
});

describe("decodeGmailPushBody", () => {
  it("décode le payload Pub/Sub", () => {
    const data = Buffer.from(
      JSON.stringify({ emailAddress: "contact@travelba.fr", historyId: 4242 }),
      "utf8"
    ).toString("base64");
    const decoded = decodeGmailPushBody({ message: { data } });
    assert.deepEqual(decoded, {
      emailAddress: "contact@travelba.fr",
      historyId: "4242",
    });
  });
  it("renvoie null sur un corps invalide", () => {
    assert.equal(decodeGmailPushBody({}), null);
    assert.equal(decodeGmailPushBody({ message: { data: "%%%" } }), null);
  });
});

describe("labels Gmail billet-avion", () => {
  it("ajoute billet-avion aux labels déjà configurés", () => {
    assert.deepEqual(mergeGmailLabelNames("Little Emperors,Expedia TAAP"), [
      "Little Emperors",
      "Expedia TAAP",
      BILLET_AVION_LABEL,
    ]);
  });

  it("ne duplique pas un label déjà présent, espaces ou tirets", () => {
    assert.deepEqual(mergeGmailLabelNames("billet avion, Little Emperors"), [
      "billet avion",
      "Little Emperors",
      "expedia-taap",
    ]);
  });

  it("retombe sur les trois labels par défaut", () => {
    assert.deepEqual(mergeGmailLabelNames("  "), [
      "little-emperors",
      "expedia-taap",
      BILLET_AVION_LABEL,
    ]);
  });

  it("rapproche Billet avion de label:billet-avion", () => {
    assert.equal(gmailLabelMatchKey("Billet avion"), BILLET_AVION_LABEL);
    assert.equal(gmailLabelMatchKey("Little Emperors"), "little-emperors");
    const map = matchGmailLabelIds(
      ["billet-avion", "little-emperors"],
      [
        { id: "Label_BA", name: "Billet avion" },
        { id: "Label_LE", name: "Little Emperors" },
      ]
    );
    assert.equal(map.get("billet-avion"), "Label_BA");
    assert.equal(map.get("little-emperors"), "Label_LE");
  });

  it("reste sur la page tant qu'il reste des billets à prendre", () => {
    const step = nextBilletBackfillCursor({
      unseenIds: ["m1", "m2", "m3"],
      insertLimit: 2,
      nextPageToken: "page-2",
      resumeToken: "",
      headOnly: false,
    });
    assert.deepEqual(step.insertIds, ["m1", "m2"]);
    assert.equal(step.cursor, "");
  });

  it("en mode terminé, ne redescend pas dans l'historique", () => {
    const step = nextBilletBackfillCursor({
      unseenIds: ["n1", "n2"],
      insertLimit: 1,
      nextPageToken: "page-2",
      resumeToken: "",
      headOnly: true,
    });
    assert.deepEqual(step.insertIds, ["n1"]);
    assert.equal(step.cursor, BILLET_BACKFILL_DONE);
  });

  it("avance puis marque le rattrapage terminé", () => {
    const next = nextBilletBackfillCursor({
      unseenIds: ["m9"],
      insertLimit: 15,
      nextPageToken: "page-2",
      resumeToken: "",
      headOnly: false,
    });
    assert.equal(next.cursor, "page-2");
    const done = nextBilletBackfillCursor({
      unseenIds: [],
      insertLimit: 15,
      resumeToken: "page-2",
      headOnly: false,
    });
    assert.equal(done.cursor, BILLET_BACKFILL_DONE);
  });
});
