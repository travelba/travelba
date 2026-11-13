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
  mb3mSoapLines,
  mb3mSupplierBlock,
  mb3mTicketRef,
  mb3mTransaviaProvider,
  resolveMb3mSupplier,
} from "./mb3m-conform";

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
});
