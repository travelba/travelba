import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findHotelBookingCard,
  findHotelExactStay,
  findHotelSameStay,
  findMatchingItem,
  flagMissingHotelCards,
  joinConfirmationRefs,
  hotelMatchKeepsStay,
  hotelSameStay,
  hotelRefsShareBooking,
  HOTEL_CONFIRMATION_GAP,
  itemMatchKey,
  keptHotelStayFields,
  collapseSharedTicketPrice,
  mergeExtractItems,
} from "./item-match";

describe("itemMatchKey", () => {
  it("fusionne deux vols au même numéro et jour", () => {
    const a = {
      kind: "flight",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T10:25:00Z",
      details: { flight_number: "AF 123" },
    };
    const b = {
      kind: "flight",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T10:25:00+02:00",
      details: { flight_number: "AF123" },
    };
    assert.equal(itemMatchKey(a), itemMatchKey(b));
  });

  it("ne fusionne pas aller et retour", () => {
    const out = itemMatchKey({
      kind: "flight",
      start_at: "2026-08-12T10:00:00Z",
      details: { flight_number: "AF123" },
    });
    const back = itemMatchKey({
      kind: "flight",
      start_at: "2026-08-20T18:00:00Z",
      details: { flight_number: "AF124" },
    });
    assert.notEqual(out, back);
  });

  it("trouve l’hôtel existant par réf.", () => {
    const existing = [{ kind: "hotel", confirmation_ref: "97620170", title: "Andaz" }];
    const hit = findMatchingItem(existing, {
      kind: "hotel",
      confirmation_ref: "97620170",
      title: "Andaz Papagayo",
    });
    assert.equal(hit?.title, "Andaz");
  });

  it("n’invente pas de clé sans réf. ni dates", () => {
    assert.equal(itemMatchKey({ kind: "activity", title: "Spa" }), null);
  });

  it("ne fusionne pas forfaits et cours maeva le même jour", () => {
    const merged = mergeExtractItems([
      {
        kind: "activity",
        title: "Forfaits Les Portes du Soleil",
        start_at: "2027-03-20",
        confirmation_ref: null,
      },
      {
        kind: "activity",
        title: "Cours collectifs journée",
        start_at: "2027-03-20",
        confirmation_ref: null,
      },
    ]);
    assert.equal(merged.length, 2);
    const hit = findMatchingItem(merged, {
      kind: "activity",
      title: "Forfaits Les Portes du Soleil",
      start_at: "2027-03-20",
    });
    assert.equal(hit?.title, "Forfaits Les Portes du Soleil");
  });

  it("ouvre une carte train quand le même dossier part un autre jour", () => {
    const existing = [
      {
        kind: "rail",
        confirmation_ref: "FEFZ75",
        title: "Milano · Roma",
        start_at: "2026-12-08T17:35:00+00:00",
      },
    ];
    const incoming = {
      kind: "rail",
      confirmation_ref: "FEFZ75",
      title: "Frecciarossa 9615",
      start_at: "2026-12-09T08:58:00+00:00",
    };
    assert.equal(findMatchingItem(existing, incoming), null);
    const sameDay = mergeExtractItems([
      incoming,
      { ...incoming, title: "Frecciarossa 9615" },
    ]);
    assert.equal(sameDay.length, 1);
  });

  it("fusionne une assurance réimportée par titre et jour", () => {
    const existing = [
      { kind: "insurance", title: "Assurance Multirisques", start_at: "2027-03-20" },
    ];
    const hit = findMatchingItem(existing, {
      kind: "insurance",
      title: "Assurance Multirisques",
      start_at: "2027-03-20",
    });
    assert.equal(hit?.title, "Assurance Multirisques");
  });

  it("complète l’hôtel déjà là quand le nom et les nuits sont les mêmes", () => {
    const existing = [
      {
        kind: "hotel",
        title: "Mondrian Bordeaux Les Carmes",
        confirmation_ref: null,
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      },
    ];
    const incoming = {
      kind: "hotel",
      title: "Mondrian Bordeaux",
      confirmation_ref: "B7G5AJC0552",
      start_at: "2026-10-13",
      end_at: "2026-10-14",
      details: { hotel_name: "Mondrian Bordeaux" },
    };
    assert.equal(findMatchingItem(existing, incoming)?.title, "Mondrian Bordeaux Les Carmes");
    assert.equal(hotelMatchKeepsStay(existing[0], incoming), true);
    const kept = keptHotelStayFields(existing[0], incoming);
    assert.equal(kept.title, "Mondrian Bordeaux Les Carmes");
    assert.equal(kept.confirmation_ref, "B7G5AJC0552");
  });

  it("ne fusionne pas deux hôtels qui ont déjà des références différentes", () => {
    const existing = [
      {
        kind: "hotel",
        title: "Hotel Eden",
        confirmation_ref: "97620170",
        start_at: "2026-06-12",
        end_at: "2026-06-15",
      },
    ];
    const incoming = {
      kind: "hotel",
      title: "Hotel Eden",
      confirmation_ref: "97620171",
      start_at: "2026-06-12",
      end_at: "2026-06-15",
    };
    assert.equal(findHotelSameStay(existing, incoming), null);
    assert.equal(findMatchingItem(existing, incoming), null);
    assert.equal(findHotelExactStay(existing, incoming), null);
  });

  it("ne choisit pas entre deux hôtels au même nom", () => {
    const existing = [
      {
        kind: "hotel",
        title: "Mondrian Bordeaux",
        confirmation_ref: null,
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      },
      {
        kind: "hotel",
        title: "Mondrian Bordeaux Les Carmes",
        confirmation_ref: null,
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      },
    ];
    assert.equal(
      findHotelSameStay(existing, {
        kind: "hotel",
        title: "Mondrian Bordeaux",
        confirmation_ref: "B7G5AJC0552",
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      }),
      null
    );
  });

  it("ne prend pas deux chambres du même hôtel pour une seule réservation", () => {
    assert.equal(hotelRefsShareBooking("64570", "64570SH046795"), true);
    assert.equal(hotelRefsShareBooking("64570SH046734", "64570SH046795"), false);
    assert.equal(hotelRefsShareBooking("71986SH009279", "71986SH009280"), false);
    assert.equal(hotelRefsShareBooking("97620170", "97620171"), false);
    const existing = [
      { kind: "hotel", confirmation_ref: "64570SH046795", title: "Four Seasons Hotel Milan" },
      { kind: "hotel", confirmation_ref: "45609SH011085", title: "Casa Monti" },
    ];
    assert.equal(
      findHotelBookingCard(existing, { kind: "hotel", confirmation_ref: "64570", title: "Hotel Milan" })?.title,
      "Four Seasons Hotel Milan"
    );
    assert.equal(
      findHotelBookingCard(
        [
          { kind: "hotel", confirmation_ref: "64570SH046734", title: "Chambre A" },
          { kind: "hotel", confirmation_ref: "64570SH046795", title: "Chambre B" },
        ],
        { kind: "hotel", confirmation_ref: "64570", title: "Four Seasons" }
      ),
      null
    );
  });

  it("garde le nom et la référence complète de la carte", () => {
    const kept = keptHotelStayFields(
      {
        title: "Four Seasons Hotel Milan",
        confirmation_ref: "64570SH046795",
        supplier: "Little Emperors",
        start_at: "2026-12-04",
        end_at: "2026-12-09",
        details: { hotel_name: "Four Seasons Hotel Milan", included: ["Petit-déjeuner"] },
      },
      {
        title: "Hotel Milan",
        confirmation_ref: "64570",
        supplier: null,
        start_at: "2026-12-04",
        end_at: "2026-12-08",
        details: { hotel_name: "Hotel Milan", included: ["Surclassement"] },
      }
    );
    assert.equal(kept.title, "Four Seasons Hotel Milan");
    assert.equal(kept.confirmation_ref, "64570SH046795");
    assert.equal(joinConfirmationRefs("HTL99881", "6504SG013242"), "HTL99881;6504SG013242");
    assert.equal(joinConfirmationRefs("6504SG013242", "htl99881"), "6504SG013242;htl99881");
    assert.equal(joinConfirmationRefs("64570SH046795", "64570"), "64570SH046795");
    assert.equal(kept.end_at, "2026-12-09");
    assert.deepEqual(kept.details.included, ["Petit-déjeuner", "Surclassement"]);
    assert.equal(kept.details.hotel_name, "Four Seasons Hotel Milan");
  });

  it("retient chaque fichier sur les deux segments du même PNR", () => {
    const merged = mergeExtractItems([
      {
        kind: "flight",
        confirmation_ref: "ZU5TCO",
        start_at: "2027-04-13T10:00:00",
        details: { flight_number: "EK 78", source_file_name: "a.pdf" },
      },
      {
        kind: "flight",
        confirmation_ref: "ZU5TCO",
        start_at: "2027-04-20T10:00:00",
        details: { flight_number: "EK 209", source_file_name: "a.pdf" },
      },
      {
        kind: "flight",
        confirmation_ref: "ZU5TCO",
        start_at: "2027-04-13T10:00:00",
        details: { flight_number: "EK 78", source_file_name: "b.pdf" },
      },
      {
        kind: "flight",
        confirmation_ref: "ZU5TCO",
        start_at: "2027-04-20T10:00:00",
        details: { flight_number: "EK 209", source_file_name: "b.pdf" },
      },
    ]);
    assert.equal(merged.length, 2);
    for (const card of merged) {
      const files = ((card.details as { source_files?: string[] }).source_files || []).slice().sort();
      assert.deepEqual(files, ["a.pdf", "b.pdf"]);
    }
  });

  it("fusionne cinq e-tickets du même segment", () => {
    const merged = mergeExtractItems(
      Array.from({ length: 5 }, () => ({
        kind: "flight",
        confirmation_ref: "XLDW2Z",
        start_at: "2026-08-12T09:50:00",
        details: { flight_number: "CM 18" },
      }))
    );
    assert.equal(merged.length, 1);
    assert.equal((merged[0]?.details as { ticket_count?: number } | undefined)?.ticket_count, 5);
  });

  it("un PNR à deux segments reste deux cartes, et un passager de plus rejoint la sienne", () => {
    const outbound = {
      kind: "flight",
      confirmation_ref: "ZU5TCO",
      start_at: "2027-04-13T10:00:00",
      title: "Nice → Dubaï",
      details: { flight_number: "EK 78", pnr: "KDP4AS", from: "NCE", to: "DXB", passengers: [{ first_name: "Raphael", last_name: "Boukris" }] },
    };
    const connection = {
      kind: "flight",
      confirmation_ref: "ZU5TCO",
      start_at: "2027-04-13T18:00:00",
      title: "Dubaï → Athènes",
      details: { flight_number: "EK 209", pnr: "KDP4AS", from: "DXB", to: "ATH", passengers: [{ first_name: "Raphael", last_name: "Boukris" }] },
    };
    const five = ["Raphael", "Elon", "Liam", "Leana", "Noemie"].map((first) => ({
      kind: "flight",
      confirmation_ref: "ZU5TCO",
      start_at: "2027-04-13T10:00:00",
      details: { flight_number: "EK 78", pnr: "KDP4AS", passengers: [{ first_name: first, last_name: "Boukris" }] },
    }));
    const fiveBack = five.map((item) => ({
      ...item,
      start_at: "2027-04-13T18:00:00",
      details: { ...item.details, flight_number: "EK 209", to: "ATH", from: "DXB" },
    }));
    const grouped = mergeExtractItems([outbound, connection, ...five, ...fiveBack]);
    const flights = grouped.filter((item) => item.kind === "flight");
    assert.equal(flights.length, 2);
    for (const card of flights) {
      const names = ((card.details as { passengers?: { first_name?: string }[] }).passengers || []).map((row) => row.first_name);
      assert.equal(names.length, 5);
    }
    const again = mergeExtractItems([
      ...grouped,
      {
        kind: "flight",
        confirmation_ref: "ZU5TCO",
        start_at: "2027-04-13T10:00:00",
        details: { flight_number: "EK 78", pnr: "KDP4AS", passengers: [{ first_name: "Lea", last_name: "Martin" }] },
      },
    ]);
    assert.equal(again.filter((item) => item.kind === "flight").length, 2);
    const nice = again.find((item) => (item.details as { flight_number?: string }).flight_number === "EK 78");
    assert.equal(((nice?.details as { passengers?: unknown[] }).passengers || []).length, 6);
  });

  it("fusionne U2 4692, 4692 et EJU4692 le même jour, et retire le doublon sans date", () => {
    const merged = mergeExtractItems([
      {
        kind: "flight",
        confirmation_ref: "KDQ68JS",
        start_at: "2026-11-02T09:10:00",
        details: { flight_number: "U2 4692", pnr: "KDQ68JS" },
      },
      {
        kind: "flight",
        confirmation_ref: "KDQ68JS",
        start_at: null,
        details: { flight_number: "4692" },
      },
      {
        kind: "flight",
        confirmation_ref: "KDQ68JS",
        start_at: "2026-11-02T09:10:00",
        details: { flight_number: "EJU4692", pnr: "KDQ68JS" },
      },
    ]);
    assert.equal(merged.length, 1);
    assert.equal((merged[0]?.details as { ticket_count?: number }).ticket_count, 2);
    assert.equal(merged[0]?.start_at, "2026-11-02T09:10:00");
  });

  it("replie la mention vide sur l’hôtel du même nom qui a des dates", () => {
    const dated = {
      kind: "hotel",
      title: "Fairmont Singapore",
      confirmation_ref: "470705216",
      start_at: "2026-11-19",
      end_at: "2026-11-22",
      details: { hotel_name: "Fairmont Singapore", included: ["Petit-déjeuner"] },
    };
    const hollow = {
      kind: "hotel",
      title: "Fairmont Singapore",
      confirmation_ref: null,
      start_at: null,
      end_at: null,
      details: { hotel_name: "Fairmont Singapore", included: ["Crédit hôtel"] },
    };
    for (const items of [
      [dated, hollow],
      [hollow, dated],
    ]) {
      const merged = mergeExtractItems(items);
      assert.equal(merged.length, 1);
      assert.equal(merged[0]?.confirmation_ref, "470705216");
      assert.equal(merged[0]?.start_at, "2026-11-19");
      assert.equal(merged[0]?.end_at, "2026-11-22");
      const included = (merged[0]?.details as { included?: string[] } | undefined)?.included || [];
      assert.deepEqual([...included].sort(), ["Crédit hôtel", "Petit-déjeuner"]);
    }
    assert.equal(
      hotelSameStay(
        { kind: "hotel", title: "Crowne Plaza Changi Airport", start_at: "2026-11-16", end_at: "2026-11-19" },
        { kind: "hotel", title: "Fairmont Singapore", start_at: "2026-11-19", end_at: "2026-11-22" }
      ),
      false
    );
    assert.equal(
      hotelSameStay(
        { kind: "hotel", title: "Hotel Eden", start_at: "2026-06-01", end_at: "2026-06-04" },
        { kind: "hotel", title: "Autre hôtel", start_at: "2026-06-02", end_at: "2026-06-05" }
      ),
      true
    );
  });
});

describe("collapseSharedTicketPrice", () => {
  it("garde le total du billet une fois quand les segments ont le même montant", () => {
    const items = collapseSharedTicketPrice([
      {
        kind: "flight",
        title: "EK 706",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T08:25:00",
        details: { document_amount: 5235, document_currency: "EUR" },
      },
      {
        kind: "flight",
        title: "EK 75",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T14:40:00",
        details: { document_amount: "5235", document_currency: "EUR" },
      },
    ]);
    assert.equal(items[0]?.details?.document_amount, 5235);
    assert.equal(items[1]?.details?.document_amount, undefined);
    assert.equal(items[1]?.details?.document_currency, "EUR");
  });

  it("laisse deux montants différents chacun sur son segment", () => {
    const items = collapseSharedTicketPrice([
      {
        kind: "flight",
        title: "Aller",
        confirmation_ref: "ABC123",
        start_at: "2027-08-04T12:40:00",
        details: { document_amount: 800 },
      },
      {
        kind: "flight",
        title: "Retour",
        confirmation_ref: "ABC123",
        start_at: "2027-08-25T14:40:00",
        details: { document_amount: 900 },
      },
    ]);
    assert.equal(items[0]?.details?.document_amount, 800);
    assert.equal(items[1]?.details?.document_amount, 900);
  });
});

function alpaga(ref: string) {
  return {
    kind: "hotel",
    title: "L'Alpaga",
    supplier: "Little Emperors",
    confirmation_ref: ref,
    start_at: "2026-12-13",
    end_at: "2026-12-18",
    details: { hotel_name: "L'Alpaga", city: "Megève", le_hotel_id: 71986 },
  };
}

describe("une confirmation d’hôtel distincte", () => {
  it("ouvre deux cartes Alpaga pour deux numéros 71986SH", () => {
    const merged = mergeExtractItems([alpaga("71986SH009279"), alpaga("71986SH009280")]);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((item) => item.confirmation_ref).sort(),
      ["71986SH009279", "71986SH009280"]
    );
  });

  it("garde 6755SH018675 et 549014 sur la même carte", () => {
    const merged = mergeExtractItems([
      {
        kind: "hotel",
        title: "Le Negresco",
        confirmation_ref: "6755SH018675",
        start_at: "2026-11-18",
        end_at: "2026-11-20",
        details: { hotel_name: "Le Negresco", city: "Nice" },
      },
      {
        kind: "hotel",
        title: "Le Negresco",
        confirmation_ref: "549014",
        start_at: "2026-11-18",
        end_at: "2026-11-20",
        details: { hotel_name: "Le Negresco", city: "Nice" },
      },
    ]);
    assert.equal(merged.length, 1);
    assert.match(merged[0]?.confirmation_ref || "", /6755SH018675/);
    assert.match(merged[0]?.confirmation_ref || "", /549014/);
    assert.equal((merged[0]?.details as { needs_review?: boolean } | undefined)?.needs_review, undefined);
  });

  it("ne crée pas de doublon au réimport du même numéro", () => {
    const once = alpaga("71986SH009279");
    const merged = mergeExtractItems([once, { ...once, title: "Alpaga" }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.confirmation_ref, "71986SH009279");
  });

  it("signale deux confirmations réduites à une seule carte", () => {
    const source = [alpaga("71986SH009279"), alpaga("71986SH009280")];
    const flagged = flagMissingHotelCards(source, [alpaga("71986SH009279")]);
    const details = flagged[0]?.details as { needs_review?: boolean; review_reason?: string } | undefined;
    assert.equal(details?.needs_review, true);
    assert.equal(details?.review_reason, HOTEL_CONFIRMATION_GAP);
  });

  it("découpe une réservation qui porte deux numéros SH", () => {
    const merged = mergeExtractItems([
      {
        ...alpaga("71986SH009279;71986SH009280"),
        details: {
          hotel_name: "L'Alpaga",
          city: "Megève",
          supplier_net: 2400,
          rooms: [
            { confirmation_ref: "71986SH009279", guests: "Queyrel" },
            { confirmation_ref: "71986SH009280", guests: "Queyrel" },
          ],
        },
      },
    ]);
    assert.equal(merged.length, 2);
    assert.equal((merged[1]?.details as { supplier_net?: number } | undefined)?.supplier_net, undefined);
  });
});
