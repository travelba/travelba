import assert from "node:assert/strict";
import test from "node:test";
import { cloturerCartePliant, modifierPlafondPliant, type PliantCardSnapshot } from "./mcp-pliant-ops";

const CARD: PliantCardSnapshot = {
  dossier_id: "22222222-2222-4222-8222-222222222222",
  reference: "TB-2026-0108",
  carte_id: "11111111-1111-4111-8111-111111111111",
  pliant_card_id: "pli_1",
  libelle: "Hôtel Bristol",
  fin: "4242",
  statut: "active",
  plafond_euros: 500,
  devise: "EUR",
};

test("le plafond et la clôture restent un aperçu sans confirmer", async () => {
  let limits = 0;
  let closed = 0;
  const effects = {
    load: async () => ({ ...CARD }),
    changeLimit: async () => {
      limits += 1;
    },
    terminate: async () => {
      closed += 1;
    },
  };
  const preview = (await modifierPlafondPliant({ plafond: "1500" }, effects)) as {
    apercu: boolean;
    ecrit: boolean;
    plafond_nouveau?: string;
    plafond_euros: number | null;
    fin: string | null;
  };
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(preview.plafond_nouveau, "1500");
  assert.equal(preview.plafond_euros, 500);
  assert.equal(preview.fin, "4242");
  const closedPreview = await cloturerCartePliant({}, effects);
  assert.equal(closedPreview.apercu, true);
  assert.equal(closedPreview.ecrit, false);
  assert.equal(closedPreview.action, "cloturer");
  assert.equal(limits, 0);
  assert.equal(closed, 0);

  const written = await modifierPlafondPliant({ plafond: 1500, confirmer: true }, effects);
  assert.equal(written.ecrit, true);
  assert.equal(written.apercu, false);
  const done = await cloturerCartePliant({ confirmer: true }, effects);
  assert.equal(done.statut, "terminated");
  assert.equal(limits, 1);
  assert.equal(closed, 1);
});

test("une carte déjà supprimée n’est pas renvoyée à Pliant", async () => {
  let closed = 0;
  await assert.rejects(
    () =>
      cloturerCartePliant(
        { confirmer: true },
        {
          load: async () => ({ ...CARD, statut: "terminated" }),
          terminate: async () => {
            closed += 1;
          },
        }
      ),
    /déjà supprimée/
  );
  assert.equal(closed, 0);
});
