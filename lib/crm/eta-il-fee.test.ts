import assert from "node:assert/strict";
import test from "node:test";
import { customerPliantCardCount, etaIlPliantCard, pickListedId, pickTravelConfig, pliantCardName, pliantRefusal } from "./eta-il-fee";
import { corridorCeilingCents, ECB_SNAPSHOT, centsToEur } from "./visa-fees";
import type { Db } from "../supabase/db";

const NAME_CHARS = /^[A-Za-z0-9äöüÄÖÜ.\-]+$/;

test("le nom sur la carte Pliant n’a que les caractères acceptés", () => {
  assert.equal(pliantCardName("Simon, Iony"), "Simon-Iony");
});

test("la carte est au nom du client, plafonnée sur les 25 ILS au cours BCE", () => {
  const card = etaIlPliantCard({
    firstName: "Simon, Iony",
    lastName: "Albilila",
    travelerCount: 4,
    bookingReference: "TB-2026-0033",
    organizationId: "org",
    today: "2026-09-24",
    startDate: "2026-12-14",
    endDate: "2026-12-23",
  });
  assert.equal(card.holderFirstName, "Simon-Iony");
  assert.equal(card.holderLastName, "Albilila");
  assert.equal(card.body.label, "Simon-Iony Albilila");
  const cents = corridorCeilingCents("IL", 4, ECB_SNAPSHOT.rates) || 0;
  assert.equal(card.feeIls, 100);
  assert.equal(card.ceilingEur, centsToEur(cents));
  assert.equal(card.body.customFirstName, "Simon-Iony");
  assert.equal(card.body.customLastName, "Albilila");
  assert.equal(card.body.limit.value, cents);
  assert.equal(card.body.limit.currency, "EUR");
  assert.equal(card.body.transactionLimit.value, cents);
  assert.equal(card.body.maxTransactionCount, 4);
  assert.equal(card.body.limitRenewFrequency, "TOTAL");
  assert.equal(card.body.validFrom, "2026-09-24");
  assert.equal(card.body.validTo, "2026-12-23");
  assert.equal("customFields" in card.body, false);
  assert.equal(JSON.stringify(card).includes("pan"), false);
});

function syntheticCard(existingCards: number, firstName = "Prenom", lastName = "Nom") {
  return etaIlPliantCard({
    firstName,
    lastName,
    travelerCount: 1,
    bookingReference: "TB-SYN",
    organizationId: "org",
    today: "2026-09-28",
    existingCards,
  });
}

test("la première carte porte le prénom et le nom, sans préfixe", () => {
  const card = syntheticCard(0);
  assert.equal(card.body.label, "Prenom Nom");
  assert.equal(card.body.customFirstName, "Prenom");
  assert.equal(card.body.customLastName, "Nom");
  assert.equal(card.body.label.includes("ETA-IL"), false);
  assert.equal(card.body.label.startsWith("Visa"), false);
});

test("les cartes suivantes ajoutent un numéro en fin de nom", () => {
  const second = syntheticCard(1);
  const third = syntheticCard(2);
  assert.equal(second.body.label, "Prenom Nom 2");
  assert.equal(second.body.customFirstName, "Prenom");
  assert.equal(second.body.customLastName, "Nom-2");
  assert.equal(third.body.label, "Prenom Nom 3");
  assert.equal(third.body.customFirstName, "Prenom");
  assert.equal(third.body.customLastName, "Nom-3");
  assert.equal(NAME_CHARS.test(second.body.customFirstName), true);
  assert.equal(NAME_CHARS.test(second.body.customLastName), true);
});

test("un nom trop long garde le numéro et reste dans les limites Pliant", () => {
  const card = syntheticCard(1, "A".repeat(50), "B".repeat(50));
  assert.equal(card.body.label.length <= 40, true);
  assert.equal(card.body.label.endsWith(" 2"), true);
  assert.equal(card.body.customFirstName, "A".repeat(50));
  assert.equal(card.body.customLastName.length <= 50, true);
  assert.equal(card.body.customLastName.endsWith("-2"), true);
  assert.equal(card.body.customLastName.startsWith("B"), true);
  assert.equal(NAME_CHARS.test(card.body.customLastName), true);
});

test("le décompte ignore les cartes sans identifiant Pliant", async () => {
  const supabase = {
    from(table: string) {
      const rows =
        table === "crm_bookings"
          ? [{ id: "b1" }, { id: "b2" }]
          : [{ pliant_card_id: "card-1" }, { pliant_card_id: "  " }, { pliant_card_id: null }];
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return Promise.resolve({ data: rows });
        },
        in() {
          return Promise.resolve({ data: rows });
        },
      };
      return builder;
    },
  };
  assert.equal(await customerPliantCardCount(supabase as unknown as Db, "cust-synthetique"), 1);
  const empty = {
    from() {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return Promise.resolve({ data: [] });
        },
        in() {
          throw new Error("pas de dossiers, pas de lecture des cartes");
        },
      };
      return builder;
    },
  };
  assert.equal(await customerPliantCardCount(empty as unknown as Db, "cust-synthetique"), 0);
});

test("un refus Pliant reste court et sans identifiant", () => {
  const line = pliantRefusal(400, JSON.stringify({ message: "Unknown custom field 123e4567-e89b-12d3-a456-426614174000" }));
  assert.match(line, /Pliant a refusé la carte/);
  assert.equal(line.includes("123e4567"), false);
  assert.equal(pliantRefusal(500, "not-json"), "Pliant a refusé la carte (500).");
});

test("un identifiant Pliant absent est remplacé seulement s’il n’y en a qu’un", () => {
  assert.equal(pickListedId("configured", ["configured", "other"]), "configured");
  assert.equal(pickListedId("missing", ["only"]), "only");
  assert.equal(pickListedId("missing", ["a", "b"]), null);
  assert.equal(
    pickTravelConfig("PLIANT_VIRTUAL_TRAVEL", [
      { cardConfig: "PLIANT_VIRTUAL", type: "VIRTUAL", canBeIssued: true },
      { cardConfig: "PLIANT_VIRTUAL_TRAVEL", type: "VIRTUAL", canBeIssued: true },
    ]),
    "PLIANT_VIRTUAL_TRAVEL"
  );
  assert.equal(
    pickTravelConfig("UNKNOWN", [{ cardConfig: "ORG_VIRTUAL_TRAVEL", type: "VIRTUAL", canBeIssued: true }]),
    "ORG_VIRTUAL_TRAVEL"
  );
});
