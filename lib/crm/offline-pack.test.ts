import assert from "node:assert/strict";
import test from "node:test";
import { offlineDocumentBlocked, offlinePack, redactPassportMarks } from "./offline-pack";
import { openBytes, sealBytes } from "./offline-seal";

const booking = {
  bookingId: "b1",
  reference: "TB-2026-0042",
  endDate: "2026-12-20",
  startDate: "2026-12-10",
  status: "confirmed",
  bookingVisible: true,
};

test("le cache garde le billet, le bon et l’assurance, pas le passeport ni le visa", () => {
  const items = offlinePack(
    [
      {
        ...booking,
        id: "ticket",
        kind: "pdf",
        fileName: "billet-AF1234.pdf",
        mimeType: "application/pdf",
        storagePath: "bookings/b1/billet.pdf",
        visible: true,
      },
      {
        ...booking,
        id: "hotel",
        kind: "confirmation",
        fileName: "voucher-maison.pdf",
        mimeType: "application/pdf",
        storagePath: "bookings/b1/hotel.pdf",
        visible: true,
      },
      {
        ...booking,
        id: "cover",
        kind: "insurance",
        fileName: "assurance.pdf",
        mimeType: "application/pdf",
        storagePath: "bookings/b1/assurance.pdf",
        visible: true,
      },
      {
        ...booking,
        id: "pass",
        kind: "passeport",
        fileName: "passeport-12AB34567.pdf",
        mimeType: "application/pdf",
        storagePath: "customers/c/passeport.pdf",
        visible: true,
      },
      {
        ...booking,
        id: "visa",
        kind: "visa",
        fileName: "esta.pdf",
        mimeType: "application/pdf",
        storagePath: "bookings/b1/esta.pdf",
        visible: true,
      },
      {
        ...booking,
        id: "hidden",
        kind: "pdf",
        fileName: "interne.pdf",
        mimeType: "application/pdf",
        storagePath: "bookings/b1/interne.pdf",
        visible: false,
      },
      {
        ...booking,
        id: "past",
        kind: "pdf",
        fileName: "ancien.pdf",
        mimeType: "application/pdf",
        storagePath: "bookings/old/ancien.pdf",
        visible: true,
        endDate: "2020-01-01",
      },
    ],
    "2026-12-01"
  );
  assert.deepEqual(
    items.map((item) => item.id),
    ["ticket", "hotel", "cover"]
  );
  assert.equal(items[0]?.fileName, "billet-AF1234.pdf");
  assert.equal(items[2]?.label.startsWith("Assurance"), true);
  assert.equal(offlineDocumentBlocked("passeport", "scan.jpg"), true);
  assert.equal(JSON.stringify(items).includes("12AB34567"), false);
});

test("un numéro de passeport disparaît du libellé, le vol reste", () => {
  assert.equal(redactPassportMarks("voucher 12AB34567.pdf"), "voucher.pdf");
  assert.equal(redactPassportMarks("AF1234"), "AF1234");
  assert.equal(redactPassportMarks("billet 123456789.pdf"), "billet.pdf");
});

test("le fichier chiffré se rouvre avec la même clé, pas avec une autre", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const other = crypto.getRandomValues(new Uint8Array(32));
  const plain = new TextEncoder().encode("billet sans numéro");
  const sealed = await sealBytes(plain, key);
  assert.notEqual(Buffer.from(sealed).toString("utf8").includes("billet"), true);
  const opened = await openBytes(sealed, key);
  assert.equal(new TextDecoder().decode(opened), "billet sans numéro");
  await assert.rejects(() => openBytes(sealed, other));
});
