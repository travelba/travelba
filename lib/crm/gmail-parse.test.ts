import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectAttachments,
  collectBodyText,
  decodeGmailPushBody,
  extractEmailAddress,
  headerValue,
  htmlToText,
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
