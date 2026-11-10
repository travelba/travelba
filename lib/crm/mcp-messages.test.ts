import assert from "node:assert/strict";
import test from "node:test";
import {
  envoyerRestaurants,
  fileWhatsapp,
  maskPhone,
  parseInbox,
  partagerSejour,
  propositionConcierge,
  sharePreviewBody,
} from "./mcp-messages";
import { McpWriteError } from "./mcp-write";

const DOSSIER = "22222222-2222-4222-8222-222222222222";
const COMPAGNON = "33333333-3333-4333-8333-333333333333";
const PROPOSITION = "44444444-4444-4444-8444-444444444444";
const MESSAGE = "55555555-5555-4555-8555-555555555555";

test("l’aperçu du partage ne contient pas le lien", () => {
  const corps = sharePreviewBody({ prenom: "Ada", titre: "Rome" });
  assert.match(corps, /Bonjour Ada/);
  assert.match(corps, /lien personnel/);
  assert.doesNotMatch(corps, /https?:/);
  assert.equal(maskPhone("+33612345678"), "•••5678");
});

test("partager un séjour n’envoie rien sans confirmer", async () => {
  let sent = 0;
  const preview = await partagerSejour(
    { dossier_id: DOSSIER, compagnon_id: COMPAGNON },
    {
      preview: async () => ({ prenom: "Ada", titre: "Rome", destinataire: "•••5678", corps: sharePreviewBody({ prenom: "Ada", titre: "Rome" }), envoie: true }),
      apply: async () => { sent += 1; return { envoye: true }; },
    }
  );
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(preview.envoye, false);
  assert.equal(sent, 0);
  const done = await partagerSejour(
    { dossier_id: DOSSIER, compagnon_id: COMPAGNON, confirmer: true },
    {
      preview: async () => ({ prenom: "Ada", titre: "Rome", destinataire: "•••5678", corps: sharePreviewBody({ prenom: "Ada", titre: "Rome" }), envoie: true }),
      apply: async () => { sent += 1; return { envoye: true }; },
    }
  );
  assert.equal(done.ecrit, true);
  assert.equal(done.envoye, true);
  assert.equal(sent, 1);
});

test("répondre dans la file montre le texte signé et n’envoie rien sans confirmer", async () => {
  let sent = 0;
  const preview = await fileWhatsapp(
    { action: "repondre", telephone: "+33612345678", texte: "Le transfert est confirmé." },
    {
      preview: async (request) => ({ action: request.action, corps: `${request.texte}\n\nL’agence`, destinataire: "•••5678", envoie: true }),
      apply: async () => { sent += 1; return { envoye: true }; },
    }
  );
  assert.equal(preview.envoye, false);
  assert.match(String((preview as { corps?: string }).corps), /L’agence/);
  assert.equal(sent, 0);
  await fileWhatsapp(
    { action: "reprendre", telephone: "+33612345678", confirmer: true },
    {
      preview: async () => ({ action: "reprendre", envoie: false, corps: "Le Concierge se tait jusqu’au lendemain matin." }),
      apply: async () => { sent += 1; return { envoye: false }; },
    }
  );
  assert.equal(sent, 1);
  assert.throws(() => parseInbox({ action: "noter", message_id: MESSAGE }), /Note invalide/);
});

test("une proposition s’approuve seulement avec confirmer", async () => {
  let sent = 0;
  const preview = await propositionConcierge(
    { action: "approuver", id: PROPOSITION },
    {
      preview: async () => ({ action: "approuver", corps: "Le transfert est prêt.\n\nL’agence", envoie: true, statut: "approved" }),
      apply: async () => { sent += 1; return { envoye: true }; },
    }
  );
  assert.equal(preview.envoye, false);
  assert.equal((preview as { envoie?: boolean }).envoie, true);
  assert.equal(sent, 0);
  const refused = await propositionConcierge(
    { action: "refuser", id: PROPOSITION, confirmer: true },
    {
      preview: async () => ({ action: "refuser", corps: null, envoie: false, statut: "rejected" }),
      apply: async () => { sent += 1; return { envoye: false }; },
    }
  );
  assert.equal(refused.envoye, false);
  assert.equal(sent, 1);
  await assert.rejects(() => propositionConcierge({ action: "modifier", id: PROPOSITION, texte: "court", confirmer: true }), /court/);
});

test("le WhatsApp restaurants reste un aperçu tant qu’il n’est pas confirmé", async () => {
  let sent = 0;
  const messages = [{ partie: "intro", texte: "Ce soir, deux tables." }];
  const preview = await envoyerRestaurants(
    { dossier_id: DOSSIER, date: "2026-11-12" },
    {
      preview: async () => ({ messages, envoie: true }),
      apply: async () => { sent += 1; return { envoye: true }; },
    }
  );
  assert.equal(preview.apercu, true);
  assert.equal(preview.envoye, false);
  assert.equal(sent, 0);
  const done = await envoyerRestaurants(
    { dossier_id: DOSSIER, date: "2026-11-12", confirmer: true },
    {
      preview: async () => ({ messages, envoie: true }),
      apply: async () => { sent += 1; return { envoye: true }; },
    }
  );
  assert.equal(done.envoye, true);
  assert.equal(sent, 1);
  await assert.rejects(() => envoyerRestaurants({ dossier_id: DOSSIER, date: "demain" }), /Date/);
  await assert.rejects(
    () =>
      fileWhatsapp(
        { action: "repondre", telephone: "+33612345678", texte: "Bonjour", confirmer: "oui" },
        { preview: async () => ({ envoie: true, corps: "Bonjour" }) }
      ),
    McpWriteError
  );
});
