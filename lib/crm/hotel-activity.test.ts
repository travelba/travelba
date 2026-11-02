import assert from "node:assert/strict";
import test from "node:test";
import {
  describeHotelGesture,
  hotelActivitySentence,
  hotelFilterLabels,
  hotelPartyShort,
  hotelStayDates,
  isHotelClientActivity,
  parseHotelActivityBody,
  presentHotelActivityLines,
} from "./hotel-activity";
import { lireRecherchesHotels } from "./hotel-activity-run";

const ROOMS = [{ adults: 2, children: [] as { age: number }[] }];

test("une recherche se lit comme Raphaël l’attend, sans prix", () => {
  const row = describeHotelGesture(
    {
      kind: "search",
      destination: "Mykonos",
      checkIn: "2026-07-12",
      checkOut: "2026-07-19",
      rooms: ROOMS,
      count: 14,
      filters: ["petit-déjeuner"],
    },
    "réel"
  );
  assert.equal(row?.summary, "A cherché Mykonos, 12–19 juil., 2 adultes");
  assert.equal(row?.detail, "14 hôtels · petit-déjeuner · réel");
  assert.equal(hotelActivitySentence("Kim Atias", row?.summary || ""), "Kim Atias a cherché Mykonos, 12–19 juil., 2 adultes");
  assert.equal(hotelStayDates("2026-06-28", "2026-07-03"), "28 juin–3 juil.");
  assert.equal(hotelPartyShort([{ adults: 2, children: [{ age: 4 }] }, { adults: 1, children: [] }]), "2 chambres, 3 adultes, 1 enfant");
  assert.equal(JSON.stringify(row).includes("€"), false);
  assert.doesNotMatch(JSON.stringify(row), /net|marge|commission/i);
});

test("chaque geste a sa phrase, le mode essai reste visible", () => {
  assert.equal(
    describeHotelGesture({ kind: "suggest", label: "Mykonos", placeKind: "ville" }, "essai")?.summary,
    "A choisi la destination Mykonos"
  );
  assert.equal(
    describeHotelGesture({ kind: "suggest", label: "Santa Marina", placeKind: "hotel" }, "essai")?.summary,
    "A choisi l’hôtel Santa Marina"
  );
  assert.equal(describeHotelGesture({ kind: "view", hotel: "Santa Marina", city: "Mykonos" }, "essai")?.detail, "Mykonos · essai");
  assert.equal(
    describeHotelGesture({ kind: "room", hotel: "Santa Marina", room: "Deluxe Sea View", rate: "Flexible" }, "réel")?.summary,
    "A ouvert la chambre Deluxe Sea View"
  );
  assert.match(describeHotelGesture({ kind: "room", hotel: "Santa Marina", room: "Deluxe Sea View", rate: "Flexible" }, "réel")?.detail || "", /Flexible/);
  assert.equal(describeHotelGesture({ kind: "sort", sort: "avantages", destination: "Mykonos", count: 8 }, "essai")?.summary, "A trié les hôtels par privilèges");
  assert.equal(describeHotelGesture({ kind: "page", page: 2, total: 20, destination: "Mykonos" }, "essai")?.summary, "A affiché la page 2 des hôtels");
  assert.equal(describeHotelGesture({ kind: "filter", filters: [], destination: "Mykonos" }, "essai")?.summary, "A retiré les filtres des hôtels");
  assert.match(
    describeHotelGesture(
      { kind: "request", via: "offre", hotel: "Santa Marina", room: "Deluxe", pay: "agence" },
      "essai"
    )?.summary || "",
    /A envoyé une demande pour Santa Marina, chambre Deluxe/
  );
  assert.equal(describeHotelGesture({ kind: "request", via: "acces" }, "essai")?.summary, "A demandé l’accès Hôtels");
  assert.equal(describeHotelGesture({ kind: "request", via: "acces", repeat: true }, "essai")?.summary, "A redemandé l’accès Hôtels");
  assert.match(
    describeHotelGesture({ kind: "error", where: "recherche", message: "La recherche n’a pas abouti.", place: "Mykonos" }, "réel")?.summary || "",
    /erreur en cherchant Mykonos/
  );
  assert.equal(describeHotelGesture({ kind: "search", destination: " ", checkIn: "", checkOut: "", rooms: [], count: 0, filters: [] }, "essai"), null);
});

test("le navigateur ne choisit pas la phrase, et un numéro long sort", () => {
  assert.equal(parseHotelActivityBody({ kind: "search", summary: "A cherché Paris" }), null);
  assert.equal(parseHotelActivityBody({ kind: "suggest", label: "Mykonos", placeKind: "ville" })?.kind, "suggest");
  assert.equal(parseHotelActivityBody({ kind: "page", page: 0 }), null);
  assert.deepEqual(hotelFilterLabels(["breakfast", "inconnu", "breakfast"]), ["petit-déjeuner"]);
  const noisy = describeHotelGesture(
    { kind: "view", hotel: "Hôtel 4111111111111111 commission", city: "" },
    "essai"
  );
  assert.equal(noisy?.summary.includes("4111"), false);
  assert.doesNotMatch(noisy?.summary || "", /commission/i);
  assert.equal(isHotelClientActivity({ action: "view", path: "/mon-compte/hotels" }), true);
  assert.equal(isHotelClientActivity({ action: "view", path: "/mon-compte" }), false);
  assert.equal(isHotelClientActivity({ action: "hotel_search", path: null }), true);
});

test("la lecture nomme le client et lie sa fiche", () => {
  const lines = presentHotelActivityLines(
    [
      {
        id: "1",
        customer_id: "client-1",
        action: "hotel_search",
        summary: "A cherché Mykonos, 12–19 juil., 2 adultes",
        detail: "14 hôtels · réel",
        path: "/mon-compte/hotels",
        created_at: "2026-07-01T10:00:00.000Z",
      },
      {
        id: "2",
        customer_id: "client-1",
        action: "view",
        summary: "A ouvert l’accueil",
        path: "/mon-compte",
        created_at: "2026-07-01T09:00:00.000Z",
      },
    ],
    [{ id: "client-1", first_name: "Kim", last_name: "Atias" }]
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].client, "Kim Atias");
  assert.equal(lines[0].fiche, "/admin/clients/client-1");
  assert.equal(lines[0].resume, "Kim Atias a cherché Mykonos, 12–19 juil., 2 adultes");
  assert.equal(lines[0].detail, "14 hôtels · réel");
});

test("une date ou un identifiant illisible est refusé avant toute lecture", async () => {
  await assert.rejects(() => lireRecherchesHotels({ du: "demain" }), /Date de début invalide/);
  await assert.rejects(() => lireRecherchesHotels({ client_id: "kim" }), /Identifiant invalide/);
  await assert.rejects(() => lireRecherchesHotels({ du: "2026-08-02", au: "2026-08-01" }), /précède/);
});
