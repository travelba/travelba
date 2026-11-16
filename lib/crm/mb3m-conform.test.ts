import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linesXml } from "./mb3m";
import {
  MB3M_ACTIVITY,
  MB3M_ALLOWED_SUPPLIER_GAPS,
  MB3M_FLIGHT_HOLD_MESSAGE,
  conformMb3mAccountLines,
  mb3mAllowedSupplierGaps,
  mb3mChooseActivity,
  mb3mCommissionId,
  mb3mCommissionIdForSend,
  mb3mConformInvoiceLine,
  mb3mFeeCode,
  mb3mInvoiceNotice,
  mb3mIsLowCostAirline,
  mb3mSaleChannel,
  mb3mAccountSyncCanSend,
  mb3mSoapLines,
  mb3mSupplierBlock,
  mb3mTicketRef,
  mb3mTransaviaProvider,
  resolveMb3mSupplier,
} from "./mb3m-conform";
import { mb3mInvoiceBlocker, type Mb3mInvoiceContext } from "./mb3m-invoice";
import type { Mb3mAccountLine } from "./mb3m-account";
import { MB3M_VERIFIED_PROVIDERS, mb3mVerifiedProviderId } from "./mb3m-verified-providers";

const TRANSAVIA_FRANCE = "11c9b85d-e7fd-4106-be84-5843083d8e81";

describe("activité MB3M", () => {
  it("suit le fichier du 12 novembre 2026", () => {
    assert.equal(mb3mChooseActivity({ kind: "flight", channel: "amadeus", airlineIata: "AF" }), MB3M_ACTIVITY.air);
    assert.equal(mb3mChooseActivity({ kind: "flight", channel: "amadeus", airlineIata: "TO", supplier: "Transavia" }), 2);
    assert.equal(mb3mChooseActivity({ kind: "flight", channel: "site", airlineIata: "AF", supplier: "Air France" }), 1001);
    assert.equal(mb3mChooseActivity({ kind: "flight", channel: "site", airlineIata: "U2", supplier: "easyJet" }), 27);
    assert.equal(mb3mChooseActivity({ kind: "flight", channel: "site", supplier: "Transavia France" }), 27);
    assert.equal(mb3mChooseActivity({ kind: "low_cost" }), 27);
    assert.equal(mb3mChooseActivity({ kind: "hotel" }), 7);
    assert.equal(mb3mChooseActivity({ kind: "transfer" }), 22);
    assert.equal(mb3mChooseActivity({ kind: "activity" }), 22);
    assert.equal(mb3mChooseActivity({ kind: "rail" }), 5);
    assert.equal(mb3mChooseActivity({ kind: "insurance" }), 3);
    assert.equal(mb3mChooseActivity({ kind: "car" }), 8);
    assert.equal(mb3mChooseActivity({ kind: "ferry" }), 9);
    assert.equal(mb3mChooseActivity({ kind: "cruise" }), 20);
    assert.equal(mb3mChooseActivity({ kind: "package" }), 11);
    assert.equal(mb3mChooseActivity({ kind: "fee" }), null);
    assert.notEqual(MB3M_ACTIVITY.air, 1001);
    assert.equal(mb3mIsLowCostAirline("TO", "Air France"), true);
    assert.equal(mb3mIsLowCostAirline("AF", "Air France"), false);
  });

  it("lit le canal sans prendre Ouigo Amadeus pour le site Ouigo", () => {
    assert.equal(mb3mSaleChannel({ kind: "rail", supplier: "Ouigo", details: { sale_channel: "amadeus" } }), "amadeus");
    assert.equal(mb3mSaleChannel({ kind: "rail", supplier: "OUIGO", title: "Paris Lyon" }), "ouigo");
    assert.equal(mb3mSaleChannel({ kind: "rail", supplier: "Trainline" }), "trainline");
    assert.equal(mb3mSaleChannel({ kind: "hotel", details: { le_hotel_id: 12 } }), "little_emperors");
    assert.equal(mb3mSaleChannel({ kind: "hotel", supplier: "Expedia TAAP" }), "expedia");
    assert.equal(mb3mSaleChannel({ kind: "flight", supplier: "Amadeus", details: { airline_iata: "AF" } }), "amadeus");
  });
});

describe("fournisseur MB3M", () => {
  it("met toute Transavia sur TRANSAVIA, jamais TRANSAVIA FRANCE", () => {
    const transavia = mb3mTransaviaProvider();
    assert.ok(transavia);
    assert.equal(transavia?.name, "TRANSAVIA");
    assert.notEqual(transavia?.id, TRANSAVIA_FRANCE);
    for (const name of ["Transavia", "TRANSAVIA FRANCE", "Transavia France"]) {
      const hit = resolveMb3mSupplier({
        kind: "flight",
        activityId: 27,
        channel: "site",
        airlineIata: "TO",
        airlineName: name,
      });
      assert.equal(hit.ok, true);
      if (hit.ok) {
        assert.equal(hit.provider.name, "TRANSAVIA");
        assert.notEqual(hit.provider.id, TRANSAVIA_FRANCE);
      }
    }
  });

  it("choisit SNCF, OUIGO direct ou TRAINLINE selon le canal", () => {
    const sncf = resolveMb3mSupplier({ kind: "rail", activityId: 5, channel: "amadeus", supplier: "Ouigo" });
    const ouigo = resolveMb3mSupplier({ kind: "rail", activityId: 5, channel: "ouigo", supplier: "OUIGO" });
    const trainline = resolveMb3mSupplier({ kind: "rail", activityId: 5, channel: "trainline", supplier: "Trainline" });
    assert.equal(sncf.ok && sncf.provider.name, "SNCF");
    assert.equal(ouigo.ok && ouigo.provider.name, "OUIGO direct");
    assert.equal(trainline.ok && trainline.provider.name, "TRAINLINE");
  });

  it("bloque un fournisseur absent et nomme la raison", () => {
    const car = resolveMb3mSupplier({ kind: "car", activityId: 8, supplier: "Sixt" });
    assert.equal(car.ok, false);
    if (!car.ok) assert.match(car.reason, /Sixt/);
    const costa = resolveMb3mSupplier({ kind: "cruise", activityId: 20, supplier: "Costa" });
    assert.equal(costa.ok, false);
    if (!costa.ok) assert.match(costa.reason, /Costa/);
    const land = resolveMb3mSupplier({ kind: "transfer", activityId: 22, supplier: "" });
    assert.equal(land.ok, false);
    const unknownAirline = conformMb3mAccountLines(
      [{ transactionId: "tx-zz", label: "Vol", amount: 90, activityId: 2, itemId: "zz", chargeKind: "flight" }],
      [{ id: "zz", kind: "flight", supplier: "Compagnie Inconnue", details: { airline_iata: "ZZ", sale_channel: "amadeus" } }]
    );
    assert.match(mb3mSupplierBlock(unknownAirline) || "", /Compagnie Inconnue/);
    assert.equal(unknownAirline[0]?.held, true);
    const lines = conformMb3mAccountLines(
      [{ transactionId: "tx-car", label: "Voiture", amount: 80, activityId: 8, itemId: "car-1", chargeKind: "car" }],
      [{ id: "car-1", kind: "car", supplier: "Sixt", title: "Sixt Nice" }]
    );
    assert.match(mb3mSupplierBlock(lines) || "", /Sixt/);
    assert.equal(mb3mSoapLines(lines, 0.01).length, 0);
  });

  it("range l’hôtel selon la source et le terrestre nommé", () => {
    const le = resolveMb3mSupplier({ kind: "hotel", activityId: 7, channel: "little_emperors" });
    const divers = resolveMb3mSupplier({ kind: "hotel", activityId: 7, channel: "direct", supplier: "Riad" });
    const expedia = resolveMb3mSupplier({ kind: "hotel", activityId: 7, channel: "expedia" });
    assert.equal(le.ok && le.provider.name, "LITTLE EMPERORS");
    assert.equal(divers.ok && divers.provider.name, "HOTELS DIVERS");
    assert.equal(expedia.ok && expedia.provider.name, "EXPEDIA");
    const guide = resolveMb3mSupplier({ kind: "activity", activityId: 22, supplier: "Get Your Guide", title: "Visite" });
    assert.equal(guide.ok && guide.provider.name, "GET YOUR GUIDE");
    const other = resolveMb3mSupplier({ kind: "transfer", activityId: 22, supplier: "Coral Thailand", title: "Transfert" });
    assert.equal(other.ok && other.provider.name, "DIVERS TERRESTRE");
    assert.equal(other.ok && other.genericLand, true);
  });

  it("liste les noms de la liste agence absents tels quels de l’export", () => {
    assert.deepEqual(mb3mAllowedSupplierGaps(), [...MB3M_ALLOWED_SUPPLIER_GAPS]);
  });
});

describe("lignes de facture", () => {
  it("met les frais d’agence en Custom, LineType 4, sans marge", () => {
    assert.equal(mb3mFeeCode({ label: "Frais de billeterie (2 billets)", amount: 50 }), "401");
    assert.equal(mb3mFeeCode({ label: "Commission d’agence", amount: 100, items: [{ kind: "hotel" }] }), "12");
    assert.equal(mb3mFeeCode({ label: "Commission d’agence", amount: 100, items: [{ kind: "hotel" }, { kind: "transfer" }] }), "13");
    assert.equal(mb3mFeeCode({ label: "Remise commerciale", amount: -20 }), "4");
    const agency = "ba3e9d2d-c2a5-4872-b5d2-99e74b483831";
    for (const [code, label] of [
      ["401", "Frais Agence Billetterie"],
      ["12", "Frais agence"],
      ["13", "Frais Agence Tourisme"],
      ["4", "Remise"],
    ] as const) {
      const line = mb3mConformInvoiceLine(
        {
          transactionId: "tx-fee",
          label,
          amount: code === "4" ? -20 : 25,
          activityId: null,
          customCode: code,
          agencyProvider: true,
          margin: null,
        },
        0.01
      );
      const xml = linesXml("InvoiceLine", [line], agency);
      assert.equal(line.marginUnit, null);
      assert.equal(line.type, "Custom");
      assert.ok(xml.includes(`<Complementary>${code}</Complementary>`), xml);
      assert.ok(xml.includes("<LineType>4</LineType>"), xml);
      assert.ok(xml.includes("<Type>Custom</Type>"), xml);
      assert.ok(xml.includes(`<ProviderId>${agency}</ProviderId>`), xml);
      assert.equal(xml.includes("<MarginUnit>"), false);
      assert.equal(xml.includes("<ActivityId>22</ActivityId>"), false);
      assert.equal(xml.includes("Commission"), false);
    }
  });

  it("retient la billetterie et prépare CommissionId sans l’envoyer", () => {
    delete process.env.MB3M_FLIGHT_COMMISSION;
    assert.equal(mb3mCommissionId(2, "international"), 1);
    assert.equal(mb3mCommissionId(2, "france"), 6);
    assert.equal(mb3mCommissionId(1001, "france"), 44);
    assert.equal(mb3mCommissionId(27, "international"), 45);
    assert.equal(mb3mCommissionId(7, "france"), null);
    assert.equal(mb3mCommissionIdForSend(2, "france"), null);
    const lines = conformMb3mAccountLines(
      [
        {
          transactionId: "tx-flight",
          label: "Vol Air France",
          amount: 400,
          activityId: 2,
          itemId: "flight-1",
          chargeKind: "flight",
          margin: 40,
        },
        {
          transactionId: "tx-hotel",
          label: "Hôtel",
          amount: 200,
          activityId: 7,
          itemId: "hotel-1",
          chargeKind: "hotel",
          margin: 20,
        },
      ],
      [
        {
          id: "flight-1",
          kind: "flight",
          supplier: "Air France",
          confirmation_ref: "ABC123",
          details: { airline_iata: "AF", sale_channel: "amadeus", ticket_number: "0579235449688" },
        },
        { id: "hotel-1", kind: "hotel", supplier: "Little Emperors", confirmation_ref: "64570", details: { le_hotel_id: 1 } },
      ]
    );
    assert.equal(lines.find((line) => line.transactionId === "tx-flight")?.held, true);
    assert.equal(lines.find((line) => line.transactionId === "tx-flight")?.activityId, 2);
    assert.equal(lines.find((line) => line.transactionId === "tx-flight")?.refPiece, "9235449688");
    assert.match(mb3mInvoiceNotice(lines) || "", new RegExp(MB3M_FLIGHT_HOLD_MESSAGE));
    const soap = mb3mSoapLines(lines, 0.01);
    assert.equal(soap.length, 1);
    assert.equal(soap[0]?.activityId, 7);
    assert.equal(soap[0]?.refPiece, "64570");
    assert.equal(soap.some((line) => line.activityId === 2), false);
    assert.equal(mb3mTicketRef("9235449688"), "9235449688");
    assert.equal(mb3mTicketRef("1349"), null);
  });

  it("n’envoie un ProviderId que s’il est dans le référentiel TBA", () => {
    delete process.env.MB3M_FLIGHT_COMMISSION;
    const little = "85abcd27-fca7-4b39-a72a-f997678367a9";
    const airFranceId = "7b98a09d-fb77-4dc3-9908-af6a74af18f0";
    const receptifs = "e9c6fe94-6df3-4e54-91f1-201b2a778930";
    const bolonLittle = "58c34812-e2d2-4b40-a578-3035cb1b4fa0";
    const bolonDivers = "a328a3a1-3641-41ff-9c30-c17b3e6076b8";
    const bolonAirFrance = "70bdae3f-d8d7-4aa0-8bf3-4209fa426504";
    assert.equal(MB3M_VERIFIED_PROVIDERS.length, 237);
    assert.equal(mb3mVerifiedProviderId("Little Emperors"), little);
    assert.equal(mb3mVerifiedProviderId("LITTLE EMPERORS"), little);
    assert.notEqual(mb3mVerifiedProviderId("LITTLE EMPERORS"), bolonLittle);
    assert.equal(mb3mVerifiedProviderId("AIR FRANCE"), airFranceId);
    assert.notEqual(airFranceId, bolonAirFrance);
    assert.equal(mb3mVerifiedProviderId("HOTELS DIVERS"), null);
    assert.equal(mb3mVerifiedProviderId("Hôtel Divers"), "013428ca-a71c-4d2a-90a7-75c279281f82");
    assert.equal(mb3mVerifiedProviderId("DISTINCT DESTINATIONS"), null);
    assert.equal(mb3mVerifiedProviderId("RECEPTIFS TOURCOM"), receptifs);
    assert.equal(mb3mVerifiedProviderId("AIR ARABIA MAROC"), "a34ae5c7-5cb0-4dc4-93b6-013a0bdc67b8");

    const lines = conformMb3mAccountLines(
      [
        { transactionId: "tx-le", label: "Hôtel Little Emperors", amount: 1200, activityId: 7, itemId: "le", chargeKind: "hotel", margin: 200 },
        { transactionId: "tx-divers", label: "Riad", amount: 800, activityId: 7, itemId: "divers", chargeKind: "hotel", margin: 80 },
        {
          transactionId: "tx-riad",
          label: "Riad Kniza",
          amount: 600,
          activityId: 7,
          itemId: "riad",
          chargeKind: "hotel",
          margin: 60,
          note: "Fournisseur : RIAD KNIZA",
        },
        {
          transactionId: "tx-af",
          label: "Vol Air France",
          amount: 400,
          activityId: 2,
          itemId: "af",
          chargeKind: "flight",
          margin: 40,
        },
        {
          transactionId: "tx-to",
          label: "Vol Transavia",
          amount: 180,
          activityId: 27,
          itemId: "to",
          chargeKind: "low_cost",
          margin: 20,
        },
      ],
      [
        { id: "le", kind: "hotel", supplier: "Little Emperors", confirmation_ref: "64570", details: { le_hotel_id: 9 } },
        { id: "divers", kind: "hotel", supplier: "Riad", title: "Riad", confirmation_ref: "H1" },
        { id: "riad", kind: "hotel", supplier: "Riad Kniza", title: "Riad Kniza" },
        {
          id: "af",
          kind: "flight",
          supplier: "Air France",
          confirmation_ref: "ABC123",
          details: { airline_iata: "AF", airline: "Air France", sale_channel: "amadeus" },
        },
        {
          id: "to",
          kind: "low_cost",
          supplier: "Transavia France",
          details: { airline_iata: "TO", airline: "Transavia France" },
        },
      ]
    );
    const byId = new Map(lines.map((line) => [line.transactionId, line]));
    const le = byId.get("tx-le");
    const divers = byId.get("tx-divers");
    const riad = byId.get("tx-riad");
    const airFrance = byId.get("tx-af");
    const transavia = byId.get("tx-to");
    assert.equal(le?.providerId, little);
    assert.equal(le?.providerName, "LITTLE EMPERORS");
    assert.equal(le?.supplierReason ?? null, null);
    assert.equal(divers?.providerId ?? null, null);
    assert.equal(divers?.providerName, "HOTELS DIVERS");
    assert.equal(divers?.note, "Fournisseur : HOTELS DIVERS");
    assert.equal(divers?.supplierReason ?? null, null);
    assert.equal(divers?.held, false);
    assert.equal(riad?.providerId ?? null, null);
    assert.equal(riad?.note, "Fournisseur : RIAD KNIZA, HOTELS DIVERS");
    assert.equal(airFrance?.providerId, airFranceId);
    assert.equal(airFrance?.providerName, "AIR FRANCE");
    assert.equal(airFrance?.note ?? null, null);
    assert.equal(airFrance?.supplierReason ?? null, null);
    assert.equal(airFrance?.held, true);
    assert.equal(transavia?.providerId, "aa8d41ef-4caf-4481-997e-d3bff7ca8e06");
    assert.equal(transavia?.providerName, "TRANSAVIA");
    assert.equal(transavia?.held, true);
    assert.equal(mb3mSupplierBlock(lines), null);
    assert.equal(mb3mAccountSyncCanSend(lines), true);
    assert.equal(mb3mInvoiceBlocker(invoiceContext(lines)), null);

    const soap = mb3mSoapLines(lines, 0.01);
    assert.deepEqual(
      soap.map((line) => line.label),
      ["Hôtel Little Emperors", "Riad", "Riad Kniza"]
    );
    assert.equal(soap.some((line) => line.activityId === 2 || line.activityId === 27), false);
    const agency = "ba3e9d2d-c2a5-4872-b5d2-99e74b483831";
    const leXml = linesXml("InvoiceLine", [soap[0]], agency);
    const diversXml = linesXml("InvoiceLine", [soap[1]], agency);
    const airFranceXml = linesXml("InvoiceLine", [mb3mConformInvoiceLine(airFrance!, 0.01)], agency);
    assert.ok(leXml.includes(`<ProviderId>${little}</ProviderId>`), leXml);
    assert.equal(leXml.includes(bolonLittle), false);
    assert.equal(diversXml.includes("<ProviderId>"), false);
    assert.equal(diversXml.includes(bolonDivers), false);
    assert.equal(diversXml.includes(agency), false);
    assert.match(diversXml, /<Note>Fournisseur : HOTELS DIVERS<\/Note>/);
    assert.ok(airFranceXml.includes(`<ProviderId>${airFranceId}</ProviderId>`), airFranceXml);
    assert.equal(airFranceXml.includes(bolonAirFrance), false);
    assert.equal(airFranceXml.includes("<Note>"), false);
    const tour = conformMb3mAccountLines(
      [{ transactionId: "tx-rt", label: "Circuit", amount: 500, activityId: 11, itemId: "pkg", chargeKind: "package" }],
      [{ id: "pkg", kind: "package", supplier: "Receptifs Tourcom", title: "Circuit" }]
    );
    assert.equal(tour[0]?.providerId, receptifs);
    assert.equal(tour[0]?.providerName, "RECEPTIFS TOURCOM");
    assert.equal(tour[0]?.supplierReason ?? null, null);
    assert.equal(mb3mSupplierBlock(tour), null);
    assert.equal(mb3mInvoiceBlocker(invoiceContext(tour)), null);
  });
});

function invoiceContext(lines: Mb3mAccountLine[]): Mb3mInvoiceContext {
  return {
    bookingId: "b",
    reference: "TB-2026-0170",
    title: "Séjour",
    currency: "EUR",
    amount: lines.reduce((sum, line) => sum + line.amount, 0),
    dateStart: "2026-06-01",
    dateEnd: "2026-06-05",
    destination: "Marrakech",
    destinationIso: "MA",
    payerKind: "personal",
    person: {
      id: "c",
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      address: { name: "Ada Lovelace", line1: "1 rue du Test", postalCode: "75001", city: "Paris", countryCode: "FR" },
    },
    company: null,
    travelers: [],
    visibleToClient: true,
    configured: true,
    lines,
    hadExpenses: true,
  };
}
