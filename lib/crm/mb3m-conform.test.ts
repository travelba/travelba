import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linesXml } from "./mb3m";
import {
  MB3M_ACTIVITY,
  MB3M_ALLOWED_SUPPLIER_GAPS,
  MB3M_FLIGHT_HOLD_MESSAGE,
  conformMb3mAccountLines,
  mb3mPliantExpenseNote,
  mb3mPliantNote,
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
  mb3mSupplierWarnings,
  mb3mTicketRef,
  mb3mTransaviaProvider,
  resolveMb3mSupplier,
} from "./mb3m-conform";
import { mb3mInvoiceBlocker, type Mb3mInvoiceContext } from "./mb3m-invoice";
import type { Mb3mAccountLine } from "./mb3m-account";
import { MB3M_VERIFIED_PROVIDERS, mb3mVerifiedProviderId } from "./mb3m-verified-providers";
import { parseMb3mActivityInput, readMb3mActivityOverride, withMb3mActivity } from "./mb3m-activity";

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
    // Un fournisseur absent du catalogue n’est plus un blocage : avertissement, sans Note envoyée.
    assert.equal(mb3mSupplierBlock(unknownAirline), null);
    assert.match(unknownAirline[0]?.supplierWarning || "", /Compagnie Inconnue/);
    assert.equal(unknownAirline[0]?.providerId ?? null, null);
    assert.equal(unknownAirline[0]?.note, "Fournisseur : Compagnie Inconnue");
    assert.equal(mb3mInvoiceBlocker(invoiceContext(unknownAirline)), null);
    const lines = conformMb3mAccountLines(
      [{ transactionId: "tx-car", label: "Voiture", amount: 80, activityId: 8, itemId: "car-1", chargeKind: "car" }],
      [{ id: "car-1", kind: "car", supplier: "Sixt", title: "Sixt Nice" }]
    );
    assert.equal(mb3mSupplierBlock(lines), null);
    assert.match(mb3mSupplierWarnings(lines) || "", /Sixt/);
    assert.match(mb3mSupplierWarnings(lines) || "", /aucun fournisseur n’est créé/);
    const sent = mb3mSoapLines(lines, 0.01);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.providerId ?? null, null);
    assert.equal(sent[0]?.note ?? null, null);
    assert.equal(sent[0]?.label, "Voiture");
    const sentXml = linesXml("InvoiceLine", sent, "ba3e9d2d-c2a5-4872-b5d2-99e74b483831");
    assert.equal(sentXml.includes("<Note>"), false);
    assert.match(sentXml, /<Label>Voiture<\/Label>/);
    assert.equal(mb3mInvoiceBlocker(invoiceContext(lines)), null);
  });

  it("TB-2026-0107 : un vol TUI fly absent du catalogue ne bloque plus la facture, il reste retenu", () => {
    const previous = process.env.MB3M_FLIGHT_EURO_COMMISSION;
    process.env.MB3M_FLIGHT_EURO_COMMISSION = "0";
    try {
      const lines = conformMb3mAccountLines(
        [
          { transactionId: "tx-tb", label: "Vol · AGA → ORY", amount: 1063.97, activityId: 2, itemId: "tb", chargeKind: "flight", margin: 0 },
          { transactionId: "tx-to", label: "Vol · ORY → AGA", amount: 492.99, activityId: 27, itemId: "to", chargeKind: "low_cost", margin: 0 },
          { transactionId: "tx-h", label: "Hôtel", amount: 3231.83, activityId: 7, itemId: "h", chargeKind: "hotel", margin: 0 },
        ],
        [
          { id: "tb", kind: "flight", supplier: "TUI fly", details: { airline_iata: "TB", airline: "TUI fly", sale_channel: "amadeus" } },
          { id: "to", kind: "low_cost", supplier: "Transavia", details: { airline_iata: "TO", airline: "Transavia" } },
          { id: "h", kind: "hotel", supplier: "Sofitel Agadir", title: "Sofitel Agadir" },
        ]
      );
      const tui = lines.find((line) => line.transactionId === "tx-tb");
      assert.equal(tui?.held, true);
      assert.equal(tui?.supplierReason ?? null, null);
      assert.match(tui?.supplierWarning || "", /Compagnie introuvable dans MB3M : TUI fly/);
      assert.equal(mb3mSupplierBlock(lines), null);
      assert.equal(mb3mInvoiceBlocker(invoiceContext(lines)), null);
      const warning = mb3mSupplierWarnings(lines) || "";
      assert.match(warning, /TUI fly/);
      assert.match(warning, /retenue/);
      assert.match(mb3mInvoiceNotice(lines) || "", new RegExp(MB3M_FLIGHT_HOLD_MESSAGE));
      const soap = mb3mSoapLines(lines, 0.01);
      assert.equal(soap.length, 1);
      assert.equal(soap[0]?.activityId, 7);
    } finally {
      if (previous === undefined) delete process.env.MB3M_FLIGHT_EURO_COMMISSION;
      else process.env.MB3M_FLIGHT_EURO_COMMISSION = previous;
    }
  });

  it("garde le blocage pour une ligne qui n’est pas une prestation fournisseur", () => {
    const empty = resolveMb3mSupplier({ kind: "transfer", activityId: 22, supplier: "" });
    assert.equal(empty.ok, false);
    assert.equal(!empty.ok && empty.unknown, undefined);
    const overhead = resolveMb3mSupplier({ kind: "fee", activityId: 14, supplier: "Frais" });
    assert.equal(overhead.ok, false);
    assert.equal(!overhead.ok && overhead.unknown, undefined);
    const noActivity = conformMb3mAccountLines(
      [{ transactionId: "tx-x", label: "Divers", amount: 10, activityId: null, itemId: "x", chargeKind: "other" }],
      [{ id: "x", kind: "other", title: "Divers" }]
    );
    assert.equal(mb3mSupplierBlock(noActivity), "Activité MB3M inconnue.");
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

describe("note Pliant", () => {
  const thin = "\u202f";

  it("écrit le montant en euros, virgule et espace insécable fine", () => {
    assert.equal(mb3mPliantNote(245), "Pliant : 245,00 €");
    assert.equal(mb3mPliantNote(1245), `Pliant : 1${thin}245,00 €`);
    assert.equal(mb3mPliantNote(1245.5), `Pliant : 1${thin}245,50 €`);
    assert.equal(mb3mPliantNote(-245), "Pliant : 245,00 €");
  });

  it("ne note qu’une dépense payée par Pliant, au montant converti sinon au montant de la dépense", () => {
    assert.equal(
      mb3mPliantExpenseNote({ itemId: "e1", details: { pliant_transaction_id: "tx" }, expenseEuros: 245, debits: [] }),
      "Pliant : 245,00 €"
    );
    assert.equal(
      mb3mPliantExpenseNote({
        itemId: "e1",
        details: { pliant_transaction_id: "tx", pliant_amount: 200 },
        expenseEuros: 245,
        debits: [{ source: "pliant", sourceId: "tx", bookingItemId: "e1", amountEur: 1245.5, originalCurrency: "USD" }],
      }),
      `Pliant : 1${thin}245,50 €`
    );
    assert.equal(
      mb3mPliantExpenseNote({
        itemId: "e1",
        details: { pliant_transaction_id: "tx" },
        expenseEuros: 80,
        debits: [{ source: "pliant", sourceId: "tx", bookingItemId: "e1", amountEur: null, originalCurrency: "USD" }],
      }),
      "Pliant : 80,00 €"
    );
    assert.equal(
      mb3mPliantExpenseNote({ itemId: "e1", details: {}, expenseEuros: 15, debits: [{ source: "revolut", sourceId: "r", bookingItemId: "e1", amountEur: 15 }] }),
      null
    );
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

  it("envoie les vols avec une commission de 1 €, sans CommissionId", () => {
    delete process.env.MB3M_FLIGHT_COMMISSION;
    delete process.env.MB3M_FLIGHT_EURO_COMMISSION;
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
    const flight = lines.find((line) => line.transactionId === "tx-flight");
    assert.equal(flight?.held, false);
    assert.equal(flight?.activityId, 2);
    assert.equal(flight?.refPiece, "9235449688");
    assert.equal(mb3mInvoiceNotice(lines), null);
    const soap = mb3mSoapLines(lines, 0.01);
    assert.equal(soap.length, 2);
    const flightSoap = soap.find((line) => line.activityId === 2);
    const hotelSoap = soap.find((line) => line.activityId === 7);
    assert.equal(hotelSoap?.refPiece, "64570");
    assert.equal(flightSoap?.commissionId ?? null, null);
    const flightXml = linesXml("InvoiceLine", [flightSoap!]);
    assert.ok(
      flightXml.includes("<CommissionNetTotal>1</CommissionNetTotal><CommissionTotal>1</CommissionTotal>"),
      flightXml
    );
    assert.equal(flightXml.includes("CommissionId"), false);
    assert.equal(linesXml("InvoiceLine", [hotelSoap!]).includes("Commission"), false);
    for (const activityId of [2, 1001, 27]) {
      const xml = linesXml("InvoiceLine", [
        { label: "Vol", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId },
      ]);
      assert.ok(xml.includes("<CommissionNetTotal>1</CommissionNetTotal><CommissionTotal>1</CommissionTotal>"), xml);
      assert.equal(xml.includes("CommissionId"), false);
    }
    const trainXml = linesXml("InvoiceLine", [
      { label: "Train", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 5, providerId: "55afb07c-1929-4243-b123-ee41655d0357", marginUnit: 2 },
    ]);
    assert.ok(trainXml.includes("<ActivityId>22</ActivityId>"), trainXml);
    assert.equal(trainXml.includes("<ActivityId>5</ActivityId>"), false);
    assert.ok(trainXml.includes("<ProviderId>55afb07c-1929-4243-b123-ee41655d0357</ProviderId>"), trainXml);
    assert.ok(trainXml.includes("<MarginUnit>2</MarginUnit>"), trainXml);
    assert.equal(trainXml.includes("Commission"), false);
    process.env.MB3M_FLIGHT_EURO_COMMISSION = "0";
    try {
      const heldLines = conformMb3mAccountLines(
        [{ transactionId: "tx-flight", label: "Vol Air France", amount: 400, activityId: 2, itemId: "flight-1", chargeKind: "flight" }],
        [{ id: "flight-1", kind: "flight", supplier: "Air France", details: { airline_iata: "AF", sale_channel: "amadeus" } }]
      );
      assert.equal(heldLines[0]?.held, true);
      assert.equal(mb3mSoapLines(heldLines, 0.01).length, 0);
      assert.match(mb3mInvoiceNotice(heldLines) || "", new RegExp(MB3M_FLIGHT_HOLD_MESSAGE));
      const off = linesXml("InvoiceLine", [{ label: "Vol", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 2 }]);
      assert.equal(off.includes("Commission"), false);
      const railOff = linesXml("InvoiceLine", [{ label: "Train", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 5 }]);
      assert.ok(railOff.includes("<ActivityId>22</ActivityId>"), railOff);
      assert.equal(railOff.includes("<ActivityId>5</ActivityId>"), false);
      assert.equal(railOff.includes("Commission"), false);
      const seaOff = linesXml("InvoiceLine", [{ label: "Maritime", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 9 }]);
      assert.ok(seaOff.includes("<ActivityId>22</ActivityId>"), seaOff);
      assert.equal(seaOff.includes("<ActivityId>9</ActivityId>"), false);
      assert.equal(seaOff.includes("Commission"), false);
    } finally {
      delete process.env.MB3M_FLIGHT_EURO_COMMISSION;
    }
    assert.equal(mb3mTicketRef("9235449688"), "9235449688");
    assert.equal(mb3mTicketRef("1349"), null);
  });

  it("envoie le train et le maritime en activité 22, sans changer le fournisseur, le net ni la marge", () => {
    delete process.env.MB3M_FLIGHT_EURO_COMMISSION;
    const train = conformMb3mAccountLines(
      [
        {
          transactionId: "tx-train",
          label: "Train · Train Paris Est · Strasbourg",
          amount: 362,
          margin: 0,
          activityId: 5,
          itemId: "rail-1",
          chargeKind: "rail",
        },
      ],
      [
        {
          id: "rail-1",
          kind: "rail",
          supplier: "OUIGO",
          title: "Train Paris Est · Strasbourg",
          details: { sale_channel: "ouigo" },
        },
      ]
    );
    assert.equal(train[0]?.activityId, MB3M_ACTIVITY.rail);
    assert.equal(train[0]?.providerName, "OUIGO direct");
    assert.equal(train[0]?.label, "Train · Train Paris Est · Strasbourg");
    assert.equal(train[0]?.held, false);
    const soap = mb3mSoapLines(train, 0.01);
    assert.equal(soap.length, 1);
    assert.equal(soap[0]?.activityId, MB3M_ACTIVITY.land);
    assert.equal(soap[0]?.label, train[0]?.label);
    assert.equal(soap[0]?.providerId ?? null, train[0]?.providerId ?? null);
    assert.equal(soap[0]?.netPriceUnit, 362);
    assert.equal(soap[0]?.netPriceTotal, 362);
    assert.equal(soap[0]?.marginUnit, 0);
    assert.equal(soap[0]?.commissionId ?? null, null);
    const xml = linesXml("InvoiceLine", soap);
    assert.ok(xml.includes("<ActivityId>22</ActivityId>"), xml);
    assert.equal(xml.includes("<ActivityId>5</ActivityId>"), false);
    assert.equal(xml.includes("Commission"), false);
    assert.ok(xml.includes("<Label>Train · Train Paris Est · Strasbourg</Label>"), xml);
    assert.ok(xml.includes("<NetPriceUnit>362</NetPriceUnit>"), xml);
    assert.ok(xml.includes("<MarginUnit>0</MarginUnit>"), xml);
    if (soap[0]?.providerId) assert.ok(xml.includes(`<ProviderId>${soap[0].providerId}</ProviderId>`), xml);
    else assert.equal(xml.includes("<ProviderId>"), false);
    assert.equal(xml.includes("<Note>"), false);
    assert.equal(soap[0]?.note ?? null, null);

    const ferry = conformMb3mAccountLines(
      [
        {
          transactionId: "tx-ferry",
          label: "Ferry Bastia",
          amount: 120,
          margin: 20,
          activityId: 9,
          itemId: "ferry-1",
          chargeKind: "ferry",
        },
      ],
      [{ id: "ferry-1", kind: "ferry", supplier: "Corsica Ferries", title: "Ferry Bastia" }]
    );
    assert.equal(ferry[0]?.activityId, MB3M_ACTIVITY.ferry);
    assert.equal(ferry[0]?.providerName, "CORSICA FERRIES");
    const ferrySoap = mb3mSoapLines(ferry, 0.01);
    assert.equal(ferrySoap[0]?.activityId, MB3M_ACTIVITY.land);
    assert.equal(ferrySoap[0]?.providerId ?? null, ferry[0]?.providerId ?? null);
    assert.equal(ferrySoap[0]?.label, "Ferry Bastia");
    assert.equal(ferrySoap[0]?.netPriceUnit, 100);
    assert.equal(ferrySoap[0]?.marginUnit, 20);
    const ferryXml = linesXml("InvoiceLine", ferrySoap);
    assert.ok(ferryXml.includes("<ActivityId>22</ActivityId>"), ferryXml);
    assert.equal(ferryXml.includes("Commission"), false);
    const maritimeOn = conformMb3mAccountLines(
      [{ transactionId: "tx-sea", label: "Maritime Bastia", amount: 120, margin: 20, activityId: 9, itemId: "sea-1", chargeKind: "maritime" }],
      [{ id: "sea-1", kind: "maritime", supplier: "Corsica Ferries", title: "Maritime Bastia" }]
    );
    assert.equal(maritimeOn[0]?.activityId, MB3M_ACTIVITY.ferry);
    assert.equal(mb3mSoapLines(maritimeOn, 0.01)[0]?.activityId, MB3M_ACTIVITY.land);

    for (const kind of ["flight", "rail", "ferry", "maritime", "low_cost", "hotel"]) {
      assert.notEqual(
        mb3mChooseActivity({ kind, channel: "site", airlineIata: "AF", supplier: "Air France" }),
        MB3M_ACTIVITY.ftiTicket
      );
    }
    const fti = linesXml("InvoiceLine", [{ label: "FTI", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 34 }]);
    assert.ok(fti.includes("<ActivityId>34</ActivityId>"), fti);
    assert.equal(fti.includes("<ActivityId>22</ActivityId>"), false);

    const direct = linesXml("InvoiceLine", [{ label: "Vol", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 1001 }]);
    const lowCost = linesXml("InvoiceLine", [{ label: "Vol", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 27 }]);
    assert.ok(direct.includes("<ActivityId>1001</ActivityId><CommissionNetTotal>1</CommissionNetTotal>"), direct);
    assert.ok(lowCost.includes("<ActivityId>27</ActivityId><CommissionNetTotal>1</CommissionNetTotal>"), lowCost);

    process.env.MB3M_FLIGHT_EURO_COMMISSION = "0";
    try {
      const restored = mb3mSoapLines(train, 0.01);
      assert.equal(train[0]?.activityId, MB3M_ACTIVITY.rail);
      assert.equal(train[0]?.providerName, "OUIGO direct");
      assert.equal(restored[0]?.activityId, MB3M_ACTIVITY.land);
      const restoredXml = linesXml("InvoiceLine", [
        { label: "Train", quantity: 1, netPriceUnit: 362, netPriceTotal: 362, activityId: 5, marginUnit: 0 },
      ]);
      assert.ok(restoredXml.includes("<ActivityId>22</ActivityId>"), restoredXml);
      assert.equal(restoredXml.includes("<ActivityId>5</ActivityId>"), false);
      assert.equal(restoredXml.includes("Commission"), false);
      const ferryRestored = mb3mSoapLines(ferry, 0.01);
      assert.equal(ferry[0]?.activityId, MB3M_ACTIVITY.ferry);
      assert.equal(ferryRestored[0]?.activityId, MB3M_ACTIVITY.land);
      const maritime = conformMb3mAccountLines(
        [{ transactionId: "tx-sea", label: "Maritime Bastia", amount: 120, margin: 20, activityId: 9, itemId: "sea-1", chargeKind: "maritime" }],
        [{ id: "sea-1", kind: "maritime", supplier: "Corsica Ferries", title: "Maritime Bastia" }]
      );
      assert.equal(maritime[0]?.activityId, MB3M_ACTIVITY.ferry);
      assert.equal(maritime[0]?.held, false);
      assert.equal(mb3mSoapLines(maritime, 0.01)[0]?.activityId, MB3M_ACTIVITY.land);
      const flightHeld = conformMb3mAccountLines(
        [{ transactionId: "tx-flight", label: "Vol Air France", amount: 400, activityId: 2, itemId: "flight-off", chargeKind: "flight" }],
        [{ id: "flight-off", kind: "flight", supplier: "Air France", details: { airline_iata: "AF", sale_channel: "amadeus" } }]
      );
      assert.equal(flightHeld[0]?.held, true);
      assert.equal(flightHeld[0]?.activityId, MB3M_ACTIVITY.air);
      assert.equal(mb3mSoapLines(flightHeld, 0.01).length, 0);
      const flightXml = linesXml("InvoiceLine", [
        { label: "Vol", quantity: 1, netPriceUnit: 400, netPriceTotal: 400, activityId: 2 },
      ]);
      assert.ok(flightXml.includes("<ActivityId>2</ActivityId>"), flightXml);
      assert.equal(flightXml.includes("Commission"), false);
      const forcedTrain = conformMb3mAccountLines(
        [{ transactionId: "tx-train", label: "Train", amount: 362, activityId: 5, itemId: "rail-land", chargeKind: "rail" }],
        [{ id: "rail-land", kind: "rail", supplier: "OUIGO", title: "Train", details: { sale_channel: "ouigo", mb3m_activity: "land" } }]
      );
      assert.equal(forcedTrain[0]?.activityId, MB3M_ACTIVITY.land);
      assert.equal(forcedTrain[0]?.providerName, "DIVERS TERRESTRE");
      assert.equal(forcedTrain[0]?.held, false);
      assert.equal(mb3mSoapLines(forcedTrain, 0.01)[0]?.activityId, MB3M_ACTIVITY.land);
    } finally {
      delete process.env.MB3M_FLIGHT_EURO_COMMISSION;
    }
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
    assert.equal(mb3mVerifiedProviderId("af"), airFranceId);
    assert.equal(mb3mVerifiedProviderId("AF"), airFranceId);
    assert.notEqual(airFranceId, bolonAirFrance);
    assert.equal(mb3mVerifiedProviderId("Compagnie inconnue"), null);
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
    assert.equal(airFrance?.held, false);
    assert.equal(transavia?.providerId, "aa8d41ef-4caf-4481-997e-d3bff7ca8e06");
    assert.equal(transavia?.providerName, "TRANSAVIA");
    assert.equal(transavia?.held, false);
    assert.equal(mb3mSupplierBlock(lines), null);
    assert.equal(mb3mAccountSyncCanSend(lines), true);
    assert.equal(mb3mInvoiceBlocker(invoiceContext(lines)), null);

    const soap = mb3mSoapLines(lines, 0.01);
    assert.deepEqual(
      soap.map((line) => line.label),
      ["Hôtel Little Emperors", "Riad", "Riad Kniza", "Vol Air France", "Vol Transavia"]
    );
    assert.equal(soap.some((line) => line.activityId === 2 || line.activityId === 27), true);
    const agency = "ba3e9d2d-c2a5-4872-b5d2-99e74b483831";
    const leXml = linesXml("InvoiceLine", [soap[0]], agency);
    const diversXml = linesXml("InvoiceLine", [soap[1]], agency);
    const airFranceXml = linesXml("InvoiceLine", [mb3mConformInvoiceLine(airFrance!, 0.01)], agency);
    assert.ok(leXml.includes(`<ProviderId>${little}</ProviderId>`), leXml);
    assert.equal(leXml.includes(bolonLittle), false);
    assert.equal(diversXml.includes("<ProviderId>"), false);
    assert.equal(diversXml.includes(bolonDivers), false);
    assert.equal(diversXml.includes(agency), false);
    assert.equal(diversXml.includes("<Note>"), false);
    assert.match(diversXml, /<Label>Riad<\/Label>/);
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

  it("facture un vol en divers terrestres sans le retenir, et laisse le vol un vol", () => {
    const flight = {
      id: "flight-tlv",
      kind: "flight",
      title: "Paris → Tel Aviv",
      supplier: "Air France",
      confirmation_ref: "ABC123",
      details: { airline_iata: "AF", airline: "Air France", sale_channel: "amadeus", from: "Paris", to: "Tel Aviv" },
    };
    const line = {
      transactionId: "tx-tlv",
      label: "Paris → Tel Aviv",
      amount: 2391.01,
      activityId: 2,
      itemId: "flight-tlv",
      chargeKind: "flight",
      margin: 100,
    };
    const previous = process.env.MB3M_FLIGHT_EURO_COMMISSION;
    process.env.MB3M_FLIGHT_EURO_COMMISSION = "0";
    try {
      const held = conformMb3mAccountLines([line], [flight]);
      assert.equal(held[0]?.held, true);
      assert.equal(held[0]?.activityId, 2);
      assert.equal(mb3mSoapLines(held, 0.01).length, 0);
      assert.match(mb3mInvoiceNotice(held) || "", new RegExp(MB3M_FLIGHT_HOLD_MESSAGE));
      const forced = conformMb3mAccountLines(
        [line],
        [{ ...flight, details: { ...flight.details, mb3m_activity: "land" } }]
      );
      assert.equal(flight.kind, "flight");
      assert.equal(forced[0]?.held, false);
      assert.equal(forced[0]?.activityId, MB3M_ACTIVITY.land);
      assert.equal(forced[0]?.providerName, "DIVERS TERRESTRE");
      const diversId = mb3mVerifiedProviderId("DIVERS TERRESTRE");
      assert.equal(forced[0]?.providerId, diversId);
      assert.equal(forced[0]?.supplierReason ?? null, null);
      assert.equal(forced[0]?.label, "Paris → Tel Aviv");
      assert.equal(mb3mInvoiceNotice(forced), null);
      const soap = mb3mSoapLines(forced, 0.01);
      assert.equal(soap.length, 1);
      assert.equal(soap[0]?.activityId, 22);
      assert.equal(soap[0]?.netPriceUnit, 2291.01);
      const xml = linesXml("InvoiceLine", soap);
      assert.equal(xml.includes("<ActivityId>22</ActivityId>"), true);
      assert.equal(xml.includes("Commission"), false);
      assert.equal(xml.includes(`<ProviderId>${diversId}</ProviderId>`), true);
    } finally {
      if (previous === undefined) delete process.env.MB3M_FLIGHT_EURO_COMMISSION;
      else process.env.MB3M_FLIGHT_EURO_COMMISSION = previous;
    }
    const stillFlight = conformMb3mAccountLines(
      [line],
      [{ ...flight, details: { ...flight.details, mb3m_activity: "land" } }]
    );
    assert.equal(stillFlight[0]?.activityId, 22);
    assert.equal(stillFlight[0]?.held, false);
    assert.equal(stillFlight[0]?.providerName, "DIVERS TERRESTRE");
    const stillSoap = mb3mSoapLines(stillFlight, 0.01);
    assert.equal(stillSoap[0]?.activityId, 22);
    const stillXml = linesXml("InvoiceLine", stillSoap);
    assert.equal(stillXml.includes("<ActivityId>22</ActivityId>"), true);
    assert.equal(stillXml.includes("Commission"), false);
    const kept = withMb3mActivity({ airline_iata: "AF", pnr: "ABC123" }, "divers terrestres");
    assert.equal("error" in kept, false);
    if (!("error" in kept)) {
      assert.equal(kept.details.airline_iata, "AF");
      assert.equal(kept.details.mb3m_activity, "land");
      assert.equal(readMb3mActivityOverride(kept.details), "land");
    }
    const cleared = withMb3mActivity({ airline_iata: "AF", mb3m_activity: "land" }, "automatique");
    assert.equal("error" in cleared, false);
    if (!("error" in cleared)) assert.equal("mb3m_activity" in cleared.details, false);
    assert.equal("error" in parseMb3mActivityInput("hôtel"), true);
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
