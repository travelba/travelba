import assert from "node:assert/strict";
import test from "node:test";
import { pieceStayTarget } from "./whatsapp-piece-link";

const STAYS = [
  { id: "ny", reference: "TB-2026-0261", destination: "New York", title: "New York" },
  { id: "av", reference: "TB-2026-0100", destination: "Avoriaz", title: "Avoriaz" },
];

test("une pièce suit le dossier nommé dans le fil, et le voyageur s’il est évident", () => {
  const named = pieceStayTarget({
    message: "",
    history: [
      { direction: "inbound", body: "C’est pour New York" },
      { direction: "outbound", body: "Bien reçu." },
    ],
    stays: STAYS,
    travelers: [
      { id: "t-michael", bookingId: "ny", firstName: "Michael", lastName: "Dahan" },
      { id: "t-lea", bookingId: "ny", firstName: "Lea", lastName: "Dahan" },
    ],
  });
  assert.equal(named?.bookingId, "ny");
  assert.equal(named?.travelerId, null);

  const one = pieceStayTarget({
    message: "Voici le PDF pour TB-2026-0261",
    history: [],
    stays: STAYS,
    travelers: [{ id: "t-michael", bookingId: "ny", firstName: "Michael", lastName: "Dahan" }],
  });
  assert.deepEqual(one, { bookingId: "ny", travelerId: "t-michael" });

  const none = pieceStayTarget({
    message: "voici une photo",
    history: [{ direction: "inbound", body: "bonjour" }],
    stays: STAYS,
  });
  assert.equal(none, null);
});
