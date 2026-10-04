import assert from "node:assert/strict";
import test from "node:test";
import { BOOKING_FLASH_TTL_MS, bookingFlashKey, readBookingFlash, writeBookingFlash } from "./booking-flash";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    size: () => map.size,
  };
}

test("le message survit au remontage puis périme", () => {
  const storage = memoryStorage();
  const key = bookingFlashKey("b1");
  writeBookingFlash(storage, key, "Enregistré.", 1_000);
  assert.equal(readBookingFlash(storage, key, 2_000), "Enregistré.");
  assert.equal(readBookingFlash(storage, key, 1_000 + BOOKING_FLASH_TTL_MS + 1), null);
  assert.equal(storage.size(), 0);
});

test("sans stockage ou avec une valeur illisible, rien ne casse", () => {
  assert.equal(readBookingFlash(null, "k"), null);
  const storage = memoryStorage();
  storage.setItem("k", "{pas du json");
  assert.equal(readBookingFlash(storage, "k"), null);
  writeBookingFlash(null, "k", "x");
});
