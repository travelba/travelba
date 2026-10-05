import assert from "node:assert/strict";
import test from "node:test";
import { days, hotels, hotelById, stages } from "./catalog";
import { quoteSelection } from "./pricing";
import { pickHotel, sanitizeSelection, selectionForPreset } from "./presets";

test("le catalogue couvre J1 à J19 sans EOLO", () => {
  assert.equal(days.length, 19);
  assert.equal(days[0].id, "J1");
  assert.equal(days[18].id, "J19");
  assert.equal(stages.length, 9);
  assert.equal(
    hotels.some((hotel) => /eolo/i.test(`${hotel.id} ${hotel.name} ${hotel.url}`)),
    false,
  );
  for (const stage of stages) {
    assert.equal(stage.days.length, stage.nights);
    assert.ok(hotels.some((hotel) => hotel.nightsAt.includes(stage.id)));
  }
});

test("le palier luxe reprend les hôtels par défaut et un total couple", () => {
  const selection = selectionForPreset("luxe");
  for (const stage of stages) {
    assert.equal(selection.hotels[stage.days[0]], stage.defaultHotel);
  }
  assert.equal(selection.activities.J1, "ba-tango");
  assert.equal(selection.activities.J8, "brc-beer");
  assert.equal(selection.activities.J12, "cal-ice");
  const quote = quoteSelection(selection);
  assert.equal(quote.lodging, 14790);
  assert.equal(quote.activities, 4561);
  assert.equal(quote.transfers, 0);
  assert.equal(quote.transfersOnRequest, 9);
  assert.equal(quote.total, 19351);
});

test("moins cher est sous le luxe, haut de gamme change d’adresse", () => {
  const luxe = quoteSelection(selectionForPreset("luxe"));
  const hdg = quoteSelection(selectionForPreset("hdg"));
  const eco = quoteSelection(selectionForPreset("eco"));
  assert.ok(eco.total < luxe.total);
  assert.equal(pickHotel("ba1", "hdg").id, "alvear");
  assert.equal(pickHotel("ba1", "eco").id, "sofitel");
  assert.equal(pickHotel("mendoza", "eco").id, "casadeuco");
  assert.equal(pickHotel("mendoza", "hdg").id, "entrecielos");
  assert.equal(pickHotel("calafate", "luxe").id, "xelena-suite");
  assert.notEqual(hdg.lodging, luxe.lodging);
});

test("une nuit changée met à jour le total, un id inconnu est ignoré", () => {
  const selection = selectionForPreset("luxe");
  selection.hotels.J1 = "fourseasons";
  const quote = quoteSelection(selection);
  const algodon = hotelById("algodon");
  const four = hotelById("fourseasons");
  assert.ok(algodon && four);
  assert.equal(quote.total, 19351 - algodon.usdNightMid + four.usdNightMid);

  const cleaned = sanitizeSelection({
    hotels: { J1: "eolo-calafate" },
    activities: { J2: "inconnue" },
    transfers: { arrivee: "aucun" },
  });
  assert.equal(cleaned.hotels.J1, "algodon");
  assert.equal(cleaned.activities.J2, selectionForPreset("luxe").activities.J2);
  assert.equal(cleaned.transfers.arrivee, "aucun");
  assert.equal(quoteSelection(cleaned).transfersOnRequest, 8);
});
