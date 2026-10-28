import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicTripView } from "../../components/crm/PublicTripView";
import { isTripShareCode } from "./trip-share-check";
import { tripShareContentDrafts } from "./trip-share-whatsapp";
import {
  EXAMPLE_TRIP_CODE,
  examplePublishedTrip,
  isExampleTripCode,
  publicTripMetadata,
  publicTripPageModel,
  publishedTripForCode,
} from "./trip-share-example";

test("le code exemple est réservé et n’est pas un code de partage", () => {
  assert.equal(EXAMPLE_TRIP_CODE, "exemple");
  assert.equal(isExampleTripCode("exemple"), true);
  assert.equal(isExampleTripCode("EXEMPLE"), false);
  assert.equal(isExampleTripCode("23456789"), false);
  assert.equal(isTripShareCode("exemple"), false);
});

test("la page exemple ne charge ni le séjour ni les contacts", async () => {
  let trips = 0;
  let contacts = 0;
  const deps = {
    loadTrip: async () => {
      trips += 1;
      return null;
    },
    loadContacts: async () => {
      contacts += 1;
      throw new Error("contacts");
    },
  };
  const model = await publicTripPageModel("exemple", deps);
  assert.ok(model);
  assert.equal(trips, 0);
  assert.equal(contacts, 0);

  const missing = await publishedTripForCode("23456789", async () => {
    trips += 1;
    return null;
  });
  assert.equal(missing, null);
  assert.equal(trips, 1);
  assert.equal(await publicTripPageModel("23456789", deps), null);
  assert.equal(contacts, 0);
});

test("l’exemple montre Camille à Marrakech, sans index et sans pièce réelle", () => {
  const trip = examplePublishedTrip();
  const raw = JSON.stringify(trip);
  assert.equal(trip.booking.reference, "TB-EXEMPLE");
  assert.equal(trip.booking.destination, "Marrakech");
  assert.equal(trip.docs.length, 0);
  assert.equal(trip.items.length, 1);
  assert.equal(trip.items[0]?.kind, "hotel");
  assert.equal(trip.items[0]?.amount, null);
  assert.equal(raw.includes("@"), false);
  assert.equal(raw.includes("passport"), false);
  assert.equal(raw.includes("hotel_contacts"), false);
  assert.equal(raw.includes("+33"), false);
  assert.match(raw, /Camille Morel/);
  assert.match(raw, /Riad de l’Exemple/);

  const meta = publicTripMetadata("exemple", trip);
  assert.deepEqual(meta.robots, { index: false, follow: false });
  assert.equal(meta.title, "Marrakech");
  assert.equal(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : "", "https://travelba.fr/v/exemple");
  const pictured = JSON.stringify(meta.openGraph?.images || "");
  assert.match(pictured, /\/api\/covers\//);
  assert.equal(pictured.includes("/api/files"), false);
  assert.deepEqual(publicTripMetadata("23456789", null).robots, { index: false, follow: false });

  const draft = tripShareContentDrafts()[0];
  assert.equal(draft?.create.variables["3"], "exemple");
  assert.equal(draft?.create.types["twilio/call-to-action"].actions[0]?.url, "https://travelba.fr/v/{{3}}");
});

test("la page publique d’exemple rend le même voyage, hors base", async () => {
  const model = await publicTripPageModel("exemple", {
    loadTrip: async () => {
      throw new Error("base");
    },
    loadContacts: async () => {
      throw new Error("contacts");
    },
  });
  assert.ok(model);
  assert.equal("customer_id" in model.booking, false);
  assert.equal("notes_internal" in model.booking, false);
  assert.equal("total_amount" in model.booking, false);
  const html = renderToStaticMarkup(
    createElement(PublicTripView, {
      booking: model.booking,
      items: model.items,
      docs: model.docs,
      partage: "exemple",
      phones: model.phones,
    })
  );
  assert.match(html, /Marrakech/);
  assert.match(html, /Riad de l’Exemple/);
  assert.match(html, /Camille Morel/);
  assert.match(html, /TB-EXEMPLE/);
  assert.match(html, /Page du voyage, sans connexion/);
  assert.match(html, /Aucun document sur ce voyage/);
  assert.equal(html.includes("€"), false);
  assert.equal(html.includes("@"), false);
  assert.equal(html.includes("hotel_contacts"), false);
  assert.match(html, /\/v\/exemple\/agenda/);
});
