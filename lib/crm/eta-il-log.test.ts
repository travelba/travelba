import assert from "node:assert/strict";
import test from "node:test";
import { ETA_IL_HOST } from "./eta-il-draft";
import {
  eventForPortalAction,
  portalEvent,
  portalMonitorNote,
  portalRunLive,
  safePortalLabel,
  stepAfterPortalRun,
} from "./eta-il-log";
import { redactPassportNumbers, runEtaIlSession } from "./eta-il-session";
import type { PortalPage } from "./eta-il-session";
import { buildEtaIlDraft } from "./eta-il-draft";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

const PASSPORT = "12AB34567";

function page(): PortalPage {
  let current = "";
  return {
    url: () => current,
    open: async (url) => {
      current = url;
    },
    click: async () => {},
    type: async () => {},
    scroll: async () => {},
    describe: async () => "page ok",
  };
}

test("un champ rempli n’écrit pas la valeur, surtout pas un passeport", () => {
  const event = eventForPortalAction({
    action: "type",
    target: "Numéro de passeport",
    text: PASSPORT,
  });
  assert.equal(event?.kind, "champ");
  assert.match(event?.text || "", /Numéro de passeport/);
  assert.equal(JSON.stringify(event).includes(PASSPORT), false);
});

test("la page journalisée n’emporte pas la requête", () => {
  assert.equal(safePortalLabel(`https://${ETA_IL_HOST}/apply?number=${PASSPORT}`), "/apply");
  assert.equal(safePortalLabel("https://example.com/apply"), "page hors portail");
});

test("l’échec du portail quitte Remplissage", () => {
  assert.equal(stepAfterPortalRun("bloqué"), "preparation");
  assert.equal(stepAfterPortalRun("à confirmer"), "validation");
  assert.equal(stepAfterPortalRun("à confirmer", true), "paiement");
  const line = portalEvent("echec", `échec ${PASSPORT}`);
  assert.equal(line.text.includes(PASSPORT), true);
  assert.equal(redactPassportNumbers(line.text, [PASSPORT]).includes(PASSPORT), false);
});

test("un remplissage sans trace est un échec visible pour l’agence", () => {
  assert.match(portalMonitorNote("remplissage", []) || "", /n’a pas pu s’ouvrir/);
  assert.equal(portalMonitorNote("preparation", []), null);
  assert.equal(portalMonitorNote("remplissage", [{ kind: "ouvert" }]), null);
  assert.equal(portalRunLive("remplissage", []), true);
  assert.equal(portalRunLive("validation", [{ kind: "fini" }]), false);
});

test("le journal de session ne répète pas le passeport saisi", async () => {
  const traveler = {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Ada",
    last_name: "Martin",
    created_at: "",
  } as CrmBookingTraveler;
  const passport = {
    id: "d1",
    customer_id: "c1",
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: PASSPORT,
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2030-01-01",
    first_name: "Ada",
    last_name: "Martin",
    birth_date: "1991-02-03",
    nationality: "FR",
    sex: "F",
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: null,
    file_name: null,
    mime_type: null,
    created_at: "",
    updated_at: "",
  } as CrmTravelDocument;
  const draft = buildEtaIlDraft({
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [traveler],
    documents: [passport],
    startDate: "2026-12-14",
    endDate: "2026-12-23",
    agencyEmail: "contact@travelba.fr",
  });
  const seen: string[] = [];
  let turn = 0;
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft,
    page: page(),
    onEvent: (event) => {
      seen.push(`${event.kind}:${event.text}`);
    },
    fetchImpl: async () => {
      turn += 1;
      const step =
        turn === 1
          ? { action: "type", url: "", target: "Passeport", text: PASSPORT, summary: "" }
          : {
              action: "hold",
              url: "",
              target: "",
              text: "",
              summary: `Ada Martin, passeport ${PASSPORT}`,
            };
      return new Response(
        JSON.stringify({
          id: `resp_${turn}`,
          output: [
            {
              type: "function_call",
              name: "portal_step",
              call_id: `call_${turn}`,
              arguments: JSON.stringify(step),
            },
          ],
        }),
        { status: 200 }
      );
    },
  });
  assert.equal(result.phase, "à confirmer");
  assert.match(seen.join("\n"), /champ:Champ « Passeport »/);
  assert.equal(seen.join("\n").includes(PASSPORT), false);
});
