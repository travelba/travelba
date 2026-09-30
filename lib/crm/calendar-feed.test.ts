import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarFeedSignature,
  calendarFeedSignatureValid,
  webcalFeedUrl,
} from "./calendar-feed";

test("signature du flux agenda : stable, et refus si la clé change", () => {
  const sig = calendarFeedSignature("TBA-1001", "sejour", "secret");
  assert.equal(sig.length, 32);
  assert.equal(calendarFeedSignatureValid("TBA-1001", "sejour", sig, "secret"), true);
  assert.equal(calendarFeedSignatureValid("TBA-1001", "sejour", sig, "autre"), false);
  assert.equal(calendarFeedSignatureValid("TBA-1001", "vol", sig, "secret"), false);
  assert.equal(calendarFeedSignatureValid("TBA-1001", "sejour", "trop-court", "secret"), false);
});

test("webcal se termine par .ics et ne contient pas le secret", () => {
  const previous = process.env.CALENDAR_FEED_SECRET;
  process.env.CALENDAR_FEED_SECRET = "secret-de-test";
  try {
    const url = webcalFeedUrl("https://travelba.fr/", "TBA-1001", "sejour");
    assert.equal(url?.startsWith("webcal://travelba.fr/api/calendrier/TBA-1001/sejour/"), true);
    assert.equal(url?.endsWith(".ics"), true);
    assert.equal(url?.includes("secret-de-test"), false);
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_FEED_SECRET;
    else process.env.CALENDAR_FEED_SECRET = previous;
  }
});
