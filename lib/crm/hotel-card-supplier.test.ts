import assert from "node:assert/strict";
import test from "node:test";
import { MB3M_HOTEL_DIVERS_PROVIDER_NAME, conformMb3mAccountLines, resolveMb3mSupplier } from "./mb3m-conform";
import { mb3mVerifiedProviderId } from "./mb3m-verified-providers";
import { HOTEL_CARD_DEFAULT_SUPPLIER, hotelSupplierFieldValue, hotelSupplierToStore } from "./hotel-card-supplier";

const HOTEL_DIVERS_ID = "013428ca-a71c-4d2a-90a7-75c279281f82";

test("le fournisseur par défaut d’une carte hôtel est Hôtel Divers, celui de MB3M", () => {
  assert.equal(HOTEL_CARD_DEFAULT_SUPPLIER, MB3M_HOTEL_DIVERS_PROVIDER_NAME);
  assert.equal(mb3mVerifiedProviderId(HOTEL_CARD_DEFAULT_SUPPLIER), HOTEL_DIVERS_ID);
  assert.equal(hotelSupplierFieldValue("hotel", ""), HOTEL_CARD_DEFAULT_SUPPLIER);
  assert.equal(hotelSupplierFieldValue("hotel", null), HOTEL_CARD_DEFAULT_SUPPLIER);
  assert.equal(hotelSupplierFieldValue("hotel", "  "), HOTEL_CARD_DEFAULT_SUPPLIER);
  assert.equal(hotelSupplierFieldValue("hotel", "Little Emperors"), "Little Emperors");
  assert.equal(hotelSupplierFieldValue("flight", ""), "");
  assert.equal(hotelSupplierFieldValue("flight", "El Al"), "El Al");
});

test("le défaut n’est pas écrit : une carte hôtel sans fournisseur reste vide", () => {
  assert.equal(hotelSupplierToStore("hotel", HOTEL_CARD_DEFAULT_SUPPLIER), "");
  assert.equal(hotelSupplierToStore("hotel", `  ${HOTEL_CARD_DEFAULT_SUPPLIER}  `), "");
  assert.equal(hotelSupplierToStore("hotel", "Marriott"), "Marriott");
  assert.equal(hotelSupplierToStore("flight", HOTEL_CARD_DEFAULT_SUPPLIER), HOTEL_CARD_DEFAULT_SUPPLIER);
  assert.equal(hotelSupplierToStore("transfer", ""), "");
});

test("une carte hôtel sans fournisseur part vers Hôtel Divers dans MB3M", () => {
  const resolved = resolveMb3mSupplier({
    kind: "hotel",
    activityId: 7,
    channel: "direct",
    supplier: "",
    title: "La Mamounia",
  });
  assert.equal(resolved.ok && resolved.provider.name, HOTEL_CARD_DEFAULT_SUPPLIER);
  assert.equal(resolved.ok && resolved.provider.id, HOTEL_DIVERS_ID);
  const lines = conformMb3mAccountLines(
    [{ transactionId: "tx-empty", label: "La Mamounia", amount: 900, activityId: 7, itemId: "empty", chargeKind: "hotel" }],
    [{ id: "empty", kind: "hotel", supplier: "", title: "La Mamounia" }]
  );
  assert.equal(lines[0]?.providerId, HOTEL_DIVERS_ID);
  assert.equal(lines[0]?.providerName, HOTEL_CARD_DEFAULT_SUPPLIER);
});
