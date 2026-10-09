import assert from "node:assert/strict";
import test from "node:test";
import { clientMailCatalog } from "./client-mail-catalog";
import { inviteClientMail, magicLinkClientMail, resetPasswordClientMail } from "./client-mails";
import { ESTA_APPLY_URL, estaClientDraft } from "./esta";

test("le catalogue reprend les e-mails d’accès et toutes les situations ESTA", () => {
  const groups = clientMailCatalog();
  const mails = groups.flatMap((group) => group.mails);
  const byId = new Map(mails.map((mail) => [mail.id, mail]));
  assert.equal(new Set(mails.map((mail) => mail.id)).size, mails.length);

  const link = "https://travelba.fr/connexion";
  const invite = inviteClientMail({ firstName: "Camille", link });
  const magic = magicLinkClientMail({ link });
  const reset = resetPasswordClientMail({ link });
  assert.equal(byId.get("invitation")?.subject, invite.subject);
  assert.equal(byId.get("invitation")?.html, invite.html);
  assert.match(invite.html, /Bonjour Camille/);
  assert.equal(byId.get("lien-magique")?.html, magic.html);
  assert.equal(byId.get("mot-de-passe")?.html, reset.html);
  for (const mail of [invite, magic, reset]) {
    assert.match(mail.html, /https:\/\/travelba\.fr\/connexion/);
    assert.doesNotMatch(mail.html, /token_hash/);
  }

  const missing = estaClientDraft({ status: "inacheve", alerts: [], reference: "TB-EXEMPLE" });
  assert.match(byId.get("esta-manquant")?.html || "", /manquant ou inachevé/);
  assert.equal(byId.get("esta-manquant")?.subject, missing?.subject);
  assert.match(byId.get("esta-valable")?.html || "", /valable jusqu’au 29\/08\/2027/);
  assert.match(byId.get("esta-expire")?.html || "", /avant la fin de votre séjour/);
  assert.match(byId.get("esta-ancien")?.html || "", /ancien passeport/);
  assert.match(byId.get("esta-refuse")?.html || "", /refusée/);
  assert.match(byId.get("esta-passeport-retour")?.html || "", /02\/11\/2026/);
  assert.match(byId.get("esta-passeport-esta")?.html || "", /avant la fin de validité de l’ESTA/);
  assert.match(byId.get("esta-manquant")?.html || "", new RegExp(ESTA_APPLY_URL.replace(/\./g, "\\.")));
});
