import assert from "node:assert/strict";
import test from "node:test";
import { bookingListSearchText } from "./booking-search";
import { smartSearchMatch } from "./smart-search";

test("le texte de liste retrouve la ville, le client, la date, le montant et le téléphone", () => {
  const text = bookingListSearchText({
    reference: "TB-2026-0042",
    title: "Lamego",
    destination: "Portugal",
    status: "confirmed",
    start_date: "2027-03-27",
    end_date: "2027-03-29",
    visible_to_client: false,
    currency: "EUR",
    customer: "Alexandre Berriche",
    company: "Atelier Berriche",
    email: "alexandre@example.com",
    phone: "+33612345678",
    routes: ["Lamego", "Porto"],
    amount: 0,
  });
  assert.equal(smartSearchMatch("lamega", text), true);
  assert.equal(smartSearchMatch("porto", text), true);
  assert.equal(smartSearchMatch("berriche", text), true);
  assert.equal(smartSearchMatch("atelier", text), true);
  assert.equal(smartSearchMatch("alexandre@example", text), true);
  assert.equal(smartSearchMatch("061234", text), true);
  assert.equal(smartSearchMatch("mars 2027", text), true);
  assert.equal(smartSearchMatch("préparation", text), true);
  assert.equal(smartSearchMatch("préparation", text), true);
  assert.equal(smartSearchMatch("avoriaz", text), false);
});
