import assert from "node:assert/strict";
import test from "node:test";
import { clientDossierRevalidations } from "./client-stay-paths";

test("enregistrer le titre invalide l’accueil, la liste et la fiche client", () => {
  assert.deepEqual(clientDossierRevalidations("TB-2026-0075"), [
    { path: "/mon-compte", type: "layout" },
    { path: "/mon-compte/reservations", type: "page" },
    { path: "/mon-compte/reservations/TB-2026-0075", type: "page" },
  ]);
  assert.equal(clientDossierRevalidations("  ").some((item) => item.path.includes("reservations/")), false);
});
