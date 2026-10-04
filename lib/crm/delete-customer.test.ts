import assert from "node:assert/strict";
import test from "node:test";
import { customerDeleteConfirmed, DELETE_CUSTOMER_CONFIRM_ERROR } from "./delete-confirm";
import { bookingFilePrefixes, customerFilePrefixes, isUuid } from "./ids";

test("only accepts uuid customer ids", () => {
  assert.equal(isUuid("d39602e0-0af3-455e-969d-802bc6eb8996"), true);
  assert.equal(isUuid("D39602E0-0AF3-455E-969D-802BC6EB8996"), true);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("clients/all"), false);
  assert.equal(isUuid("../etc/passwd"), false);
});

test("file prefixes stay under the customer and its bookings, agency-cards included", () => {
  const customerId = "d39602e0-0af3-455e-969d-802bc6eb8996";
  const bookingId = "e29a2074-5f2c-4719-8507-6947366e37ba";
  assert.deepEqual(customerFilePrefixes(customerId, [bookingId]), [
    `customers/${customerId}`,
    `bookings/${bookingId}`,
    `agency-cards/${bookingId}`,
  ]);
  assert.deepEqual(bookingFilePrefixes(bookingId), [`bookings/${bookingId}`, `agency-cards/${bookingId}`]);
  assert.deepEqual(customerFilePrefixes(customerId, []), [`customers/${customerId}`]);
});

test("la suppression exige le nom complet, casse, espaces et accents indifférents", () => {
  assert.equal(customerDeleteConfirmed("Jérémy Moïse", "Jérémy Moïse"), true);
  assert.equal(customerDeleteConfirmed("  jeremy   moise ", "Jérémy Moïse"), true);
  assert.equal(customerDeleteConfirmed("JEREMY MOISE", "Jérémy Moïse"), true);
  assert.equal(customerDeleteConfirmed("Jérémy", "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed("Jérémy Moïse Dupont", "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed("", "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed(undefined, "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed(null, "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed("", ""), false);
  assert.equal(customerDeleteConfirmed("Client", "Client"), true);
  assert.equal(DELETE_CUSTOMER_CONFIRM_ERROR, "Saisissez le nom du client pour confirmer");
});
