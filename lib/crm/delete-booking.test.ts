import assert from "node:assert/strict";
import test from "node:test";
import { linkedPliantCards, PLIANT_NOT_FROZEN } from "./delete-booking";
import { exclusiveStoragePaths } from "./ids";
import { supprimerDossier } from "./mcp-desk";
import { McpWriteError } from "./mcp-write";

test("keeps passport scans still used by the client vault", () => {
  assert.deepEqual(
    exclusiveStoragePaths(
      ["customers/c/passport.pdf", "bookings/b/copy.pdf"],
      ["customers/c/passport.pdf"]
    ),
    ["bookings/b/copy.pdf"]
  );
});

const CARD = "5057d8a7-02d1-4afd-b792-f936f4e7c3bc";

test("une carte active, sur le dossier ou seulement sur le séjour, bloque la suppression", () => {
  const active = linkedPliantCards({
    bookingCards: [{ pliant_card_id: CARD, status: "active" }],
    registry: [{ pliant_card_id: CARD, status: "active" }],
    stays: [{ state: { pliantCardId: CARD, pliant: "issued" } }],
  });
  assert.equal(active[0]?.frozen, false);

  const stayOnly = linkedPliantCards({
    bookingCards: [],
    registry: [],
    stays: [{ state: { pliantCardId: CARD, pliant: "issued" } }],
  });
  assert.equal(stayOnly[0]?.frozen, false);

  const frozen = linkedPliantCards({
    bookingCards: [{ pliant_card_id: CARD, status: "locked" }],
    registry: [{ pliant_card_id: CARD, status: "locked" }],
    stays: [{ state: { pliantCardId: CARD, pliant: "issued" } }],
  });
  assert.equal(frozen[0]?.frozen, true);
  assert.match(PLIANT_NOT_FROZEN, /gelée/);
});

test("supprimer_dossier exige confirmer et ne part pas si la carte n’est pas gelée", async () => {
  let called = false;
  await assert.rejects(
    () =>
      supprimerDossier(
        { reference: "TB-2026-0147" },
        {
          findBooking: async () => ({ id: "3bb29e58-a60f-4eff-8d55-902db909cafa", reference: "TB-2026-0147" }),
          removeMistaken: async () => {
            called = true;
            return { reference: "TB-2026-0147", sejours: 1, reservations_le: 1 };
          },
        }
      ),
    (err: unknown) => err instanceof McpWriteError && /confirmer true/.test(err.message)
  );
  assert.equal(called, false);

  await assert.rejects(
    () =>
      supprimerDossier(
        { reference: "TB-2026-0147", confirmer: true },
        {
          findBooking: async () => ({ id: "3bb29e58-a60f-4eff-8d55-902db909cafa", reference: "TB-2026-0147" }),
          removeMistaken: async () => {
            throw new Error(PLIANT_NOT_FROZEN);
          },
        }
      ),
    (err: unknown) => err instanceof McpWriteError && err.message === PLIANT_NOT_FROZEN
  );

  const removed = await supprimerDossier(
    { reference: "TB-2026-0147", confirmer: true },
    {
      findBooking: async () => ({ id: "3bb29e58-a60f-4eff-8d55-902db909cafa", reference: "TB-2026-0147" }),
      removeMistaken: async () => ({ reference: "TB-2026-0147", sejours: 1, reservations_le: 1 }),
    }
  );
  assert.equal(removed.supprime, true);
  assert.equal(removed.sejours, 1);
  assert.equal(removed.reservations_le, 1);
});
