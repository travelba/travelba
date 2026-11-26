import assert from "node:assert/strict";
import test from "node:test";
import { buildAgencyRequestBrief, scrubClientTurn } from "./whatsapp-request-brief";

test("le résumé reprend les tours utiles, le séjour et l’attente", () => {
  const body = buildAgencyRequestBrief({
    message: "Oui",
    history: [
      { direction: "inbound", body: "Je voudrais un hôtel au Mexique en mars" },
      { direction: "outbound", body: "Souhaitez-vous que j’en parle à l’agence ?" },
      { direction: "inbound", body: "Mexique" },
    ],
    stay: "TB-2026-0042 · Mexique",
    expected: "Question à l’agence",
  });
  assert.match(body, /Je voudrais un hôtel au Mexique en mars/);
  assert.match(body, /Mexique/);
  assert.match(body, /Attendu : Question à l’agence/);
  assert.match(body, /Séjour : TB-2026-0042 · Mexique/);
  assert.notEqual(body.trim(), "Oui");
  assert.equal(body.startsWith("Oui"), false);
});

test("« c’est une question » ne remplace pas le besoin", () => {
  const body = buildAgencyRequestBrief({
    message: "Non c est une question.",
    history: [{ direction: "inbound", body: "À quelle heure est le transfert jeudi ?" }],
    expected: "Question à l’agence",
  });
  assert.match(body, /transfert jeudi/);
  assert.equal(body.includes("Non c est une question"), false);
});

test("passeport, naissance et MRZ ne sont pas recopiés", () => {
  const mrz = "P<FRADUPONT<<MARIE<<<<<<<<<<<<<<<<<<<<";
  const raw = `Mon passeport est 12AB34567, né le 01/01/1990.\n${mrz}`;
  assert.equal(scrubClientTurn(raw).includes(mrz), false);
  assert.equal(scrubClientTurn(raw).toLowerCase().includes("passeport"), false);
  assert.equal(scrubClientTurn(raw).includes("01/01/1990"), false);
  const body = buildAgencyRequestBrief({
    message: raw,
    history: [],
    expected: "Question à l’agence",
  });
  assert.equal(body.includes(mrz), false);
  assert.equal(body.includes("12AB34567"), false);
  assert.equal(body.includes("01/01/1990"), false);
});
