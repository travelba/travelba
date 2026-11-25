import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chooseShellTarget, mergeShell, sanitizeDocument, sanitizeShell, sanitizeStay } from "./client-shell";

const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";

test("le cache d’un séjour ne garde ni numéro, ni chemin, ni lien fabriqué", () => {
  const stay = sanitizeStay({
    reference: "TB-2026-0042",
    title: "Tel Aviv et les Seychelles",
    when: "12–20 mars",
    href: "https://evil.example/admin",
    place: "Tel Aviv",
    upcoming: true,
    number: "12AB345678",
    storage_path: "customers/x/passport.pdf",
    email: "a@b.c",
  });
  assert.equal(stay?.href, "/mon-compte/reservations/TB-2026-0042");
  assert.equal(stay?.title, "Tel Aviv et les Seychelles");
  assert.equal("number" in (stay || {}), false);
  assert.equal(sanitizeStay({ reference: "../admin", title: "x" }), null);
  assert.equal(sanitizeStay({ reference: "TB 1", title: "x" }), null);
});

test("une pièce ne conserve pas un numéro dans le nom", () => {
  assert.deepEqual(sanitizeDocument({ id: DOC, name: "Passeport 12AB345678.pdf", type: "passport" }), {
    id: DOC,
    name: "Pièce",
    type: "passport",
  });
  assert.equal(sanitizeDocument({ id: DOC, name: "Assurance voyage.pdf", type: "insurance" })?.name, "Assurance voyage.pdf");
  assert.equal(sanitizeDocument({ id: "pas-un-uuid", name: "a", type: "other" }), null);
});

test("le cache est par fiche, et une autre fiche ne reprend pas les séjours", () => {
  const first = sanitizeShell({
    userId: USER,
    greeting: "Camille",
    stays: [{ reference: "TB-2026-0001", title: "Rome", when: "1 mai", upcoming: true }],
    documents: [{ id: DOC, name: "Billet.pdf", type: "other" }],
  });
  const other = "33333333-3333-4333-8333-333333333333";
  const replaced = mergeShell(first, { userId: other, greeting: "Ada", stays: [] }, "2026-11-23T10:00:00.000Z");
  assert.equal(replaced?.userId, other);
  assert.equal(replaced?.stays.length, 0);
  assert.equal(replaced?.documents.length, 0);
  const kept = mergeShell(first, { userId: USER, greeting: "Camille" }, "2026-11-23T10:00:00.000Z");
  assert.equal(kept?.stays.length, 1);
  assert.equal(kept?.documents.length, 1);
});

test("l’écran local reste hors ligne, un lien client s’ouvre, l’agence non", () => {
  assert.deepEqual(chooseShellTarget({ online: false, launchUrl: "https://travelba.fr/mon-compte/reservations/TB-1" }), {
    action: "stay",
    url: null,
  });
  assert.equal(
    chooseShellTarget({ online: true, launchUrl: "https://www.travelba.fr/mon-compte/reservations/TB-1?x=1" }).url,
    "https://travelba.fr/mon-compte/reservations/TB-1?x=1"
  );
  assert.equal(
    chooseShellTarget({ online: true, launchUrl: "https://travelba.fr/admin/reservations" }).url,
    "https://travelba.fr/connexion?error=application"
  );
  assert.equal(chooseShellTarget({ online: true, launchUrl: "https://wa.me/33756841315" }).url, "https://travelba.fr/mon-compte");
  assert.equal(
    chooseShellTarget({ online: true, pushUrl: "/mon-compte/reservations/TB-9" }).url,
    "https://travelba.fr/mon-compte/reservations/TB-9"
  );
  assert.equal(chooseShellTarget({ online: true, pushUrl: "https://travelba.fr/admin" }).url, "https://travelba.fr/mon-compte");
});

test("l’enveloppe iOS reprend la même adresse et le cache par fiche", () => {
  const shell = readFileSync(new URL("../../mobile/www/shell.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../mobile/www/index.html", import.meta.url), "utf8");
  assert.match(shell, /https:\/\/travelba\.fr\/mon-compte/);
  assert.match(shell, /connexion\?error=application/);
  assert.match(shell, /tba\.espace/);
  assert.doesNotMatch(shell, /location\.replace\([^)]*\/admin/);
  assert.match(html, /data-mode="boot"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
});
