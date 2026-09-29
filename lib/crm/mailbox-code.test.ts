import assert from "node:assert/strict";
import test from "node:test";
import {
  extractVerificationCode,
  mailboxCodeAsked,
  pickVerificationCode,
  pollVerificationCode,
  verificationMailQuery,
} from "./mailbox-code";

test("l’écran de code est reconnu, pas le champ e-mail", () => {
  assert.equal(
    mailboxCodeAsked("Email Address Verification. We have sent a 6-digit code to the agency. Code to 6 digits"),
    true
  );
  assert.equal(mailboxCodeAsked("veuillez fournir le code de vérification à six chiffres reçu par courriel"), true);
  assert.equal(mailboxCodeAsked("Champ « Confirm Email Address »"), false);
  assert.equal(mailboxCodeAsked("Code à 6 chiffres saisi depuis la boîte agence."), false);
});

test("le code à six chiffres se lit à côté du mot vérification", () => {
  assert.equal(extractVerificationCode("Your verification code is 482913. It expires in 10 minutes."), "482913");
  assert.equal(extractVerificationCode("Code de vérification : 482 913"), "482913");
  assert.equal(extractVerificationCode("Booking code 482913 for your hotel"), null);
  assert.equal(extractVerificationCode("verification passport AB123456"), null);
  assert.equal(extractVerificationCode("verification phone 0541234567"), null);
});

test("seul le message récent fournit le code", () => {
  const now = Date.parse("2026-09-29T12:34:00.000Z");
  const code = pickVerificationCode(
    [
      {
        subject: "Older",
        text: "Your verification code is 111111.",
        receivedAt: "2026-09-29T10:00:00.000Z",
      },
      {
        subject: "Israel entry",
        text: "Your verification code is 482913.",
        receivedAt: "2026-09-29T12:33:40.000Z",
      },
    ],
    now
  );
  assert.equal(code, "482913");
});

test("la lecture attend le courriel puis s’arrête", async () => {
  let calls = 0;
  const code = await pollVerificationCode({
    sinceMs: Date.parse("2026-09-29T12:34:00.000Z"),
    query: verificationMailQuery(),
    attempts: 3,
    waitMs: 1,
    sleep: async () => {},
    search: async (query) => {
      assert.match(query, /verification/);
      calls += 1;
      if (calls < 2) return [];
      return [
        {
          subject: "Email verification",
          text: "Your verification code is 482913.",
          receivedAt: "2026-09-29T12:33:50.000Z",
        },
      ];
    },
  });
  assert.equal(code, "482913");
  assert.equal(calls, 2);
});
