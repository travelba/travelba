import assert from "node:assert/strict";
import test from "node:test";
import { carnetAdditionBody, decideFollowupDelivery } from "./carnet-addition";
import { TOUCHPOINT_KINDS, decideTouchpointDelivery } from "./concierge-touchpoints";

const LINK = "https://travelba.fr/mon-compte/reservations/TB-2026-0108";

test("le message d’ajout groupe les prestations, sans prix ni fournisseur", () => {
  assert.equal(
    carnetAdditionBody(["flight", "flight"], "TB-2026-0108"),
    `Vos vols ont été ajoutés à votre carnet.\n${LINK}`
  );
  assert.equal(
    carnetAdditionBody(["hotel"], "TB-2026-0108"),
    `Votre hôtel a été ajouté à votre carnet.\n${LINK}`
  );
  assert.equal(
    carnetAdditionBody(["flight", "hotel"], "TB-2026-0108"),
    `Votre vol et votre hôtel ont été ajoutés à votre carnet.\n${LINK}`
  );
  assert.equal(
    carnetAdditionBody(["flight", "flight", "hotel"], "TB-2026-0108"),
    `Vos vols et votre hôtel ont été ajoutés à votre carnet.\n${LINK}`
  );
  assert.equal(
    carnetAdditionBody(["transfer", "hotel", "flight"], "TB-2026-0108"),
    `Votre vol, votre hôtel et votre transfert ont été ajoutés à votre carnet.\n${LINK}`
  );
  assert.equal(
    carnetAdditionBody(["activity"], "TB-2026-0108"),
    `Votre activité a été ajoutée à votre carnet.\n${LINK}`
  );
  assert.equal(
    carnetAdditionBody(["activity", "insurance"], "TB-2026-0108"),
    `Votre activité et votre assurance ont été ajoutées à votre carnet.\n${LINK}`
  );
  assert.equal(carnetAdditionBody(["fee", "expense", "Little Emperors"], "TB-2026-0108"), "");
  const body = carnetAdditionBody(["flight", "hotel", "rail"], "TB-2026-0108");
  assert.doesNotMatch(body, /little|expedia|commission|fournisseur|€|420|\bnet\b/i);
  assert.match(body, new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(TOUCHPOINT_KINDS.includes("carnet_ajout" as (typeof TOUCHPOINT_KINDS)[number]), false);
});

test("l’ajout au carnet s’envoie au clic, seulement dans la fenêtre, jamais seul", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const ready = decideFollowupDelivery({
    kind: "carnet_ajout",
    windowOpen: true,
    preview: false,
    dueAt: "2026-10-01T00:00:00.000Z",
    now,
  });
  assert.deepEqual(ready, { send: true, mode: "session" });
  const closed = decideFollowupDelivery({
    kind: "carnet_ajout",
    windowOpen: false,
    preview: false,
    dueAt: now.toISOString(),
    now,
  });
  assert.equal(closed.send, false);
  if (!closed.send) assert.match(closed.error, /reste prêt/);
  const preview = decideFollowupDelivery({
    kind: "carnet_ajout",
    windowOpen: true,
    preview: true,
    dueAt: now.toISOString(),
    now,
  });
  assert.equal(preview.send, false);
  const legacy = decideTouchpointDelivery({
    kind: "carnet_ajout",
    windowOpen: true,
    preview: false,
    dueAt: now.toISOString(),
    now,
  });
  assert.equal(legacy.send, false);
});
