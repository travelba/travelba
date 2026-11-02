import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  Mb3mError,
  mb3mActivityId,
  mb3mAddCreditNote,
  mb3mAddInvoice,
  mb3mAgencyNames,
  mb3mBlockedOnProduction,
  mb3mCivilityFromSex,
  mb3mConfigured,
  mb3mDefaultProviderId,
  mb3mFaultDetail,
  mb3mOperationMessage,
  mb3mFindPersons,
  linesXml,
  mb3mPartnerCode,
  mb3mPdfBytes,
  mb3mPieceState,
  mb3mRealm,
  mb3mRenderPiece,
  mb3mSaveCompany,
  mb3mSaveFolder,
  mb3mSavePerson,
  mb3mSingleAgencyUid,
  mb3mTicketingActivity,
  mb3mXmlText,
} from "./mb3m";
import { mb3mDossierLines } from "./mb3m-account";
import { mb3mInvoiceLine } from "./mb3m-invoice";

const previous = {
  user: process.env.MB3M_API_USER,
  password: process.env.MB3M_API_PASSWORD,
  activity: process.env.MB3M_ACTIVITY_ID,
  prodUser: process.env.MB3M_PROD_API_USER,
  prodPassword: process.env.MB3M_PROD_API_PASSWORD,
  prodActivity: process.env.MB3M_PROD_ACTIVITY_ID,
  provider: process.env.MB3M_PROVIDER_ID,
  prodProvider: process.env.MB3M_PROD_PROVIDER_ID,
  vercel: process.env.VERCEL_ENV,
};

afterEach(() => {
  restore("MB3M_API_USER", previous.user);
  restore("MB3M_API_PASSWORD", previous.password);
  restore("MB3M_ACTIVITY_ID", previous.activity);
  restore("MB3M_PROD_API_USER", previous.prodUser);
  restore("MB3M_PROD_API_PASSWORD", previous.prodPassword);
  restore("MB3M_PROD_ACTIVITY_ID", previous.prodActivity);
  restore("MB3M_PROVIDER_ID", previous.provider);
  restore("MB3M_PROD_PROVIDER_ID", previous.prodProvider);
  restore("VERCEL_ENV", previous.vercel);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function arm() {
  delete process.env.VERCEL_ENV;
  delete process.env.MB3M_PROVIDER_ID;
  delete process.env.MB3M_PROD_PROVIDER_ID;
  process.env.MB3M_API_USER = "agent@partner";
  process.env.MB3M_API_PASSWORD = "secret-value";
}

function commissionTags(amount: number | string) {
  return `<CommissionNetTotal>${amount}</CommissionNetTotal><CommissionTaxRate>0</CommissionTaxRate><CommissionTotal>${amount}</CommissionTotal>`;
}

describe("client MB3M Partners", () => {
  it("ignore les identifiants de test en production Travelba", () => {
    process.env.MB3M_API_USER = "agent@partner";
    process.env.MB3M_API_PASSWORD = "secret-value";
    process.env.MB3M_ACTIVITY_ID = "3";
    delete process.env.MB3M_PROD_API_USER;
    delete process.env.MB3M_PROD_API_PASSWORD;
    delete process.env.MB3M_PROD_ACTIVITY_ID;
    process.env.VERCEL_ENV = "production";
    assert.equal(mb3mRealm(), "production");
    assert.equal(mb3mBlockedOnProduction(), true);
    assert.equal(mb3mConfigured(), false);
    assert.equal(mb3mActivityId(), null);
    assert.equal(mb3mPartnerCode("11111111-2222-4333-8444-555555555555"), "11111111222243");
  });

  it("en production, lit les identifiants d’agence et ignore ceux du test", () => {
    process.env.VERCEL_ENV = "production";
    process.env.MB3M_API_USER = "agent@partner";
    process.env.MB3M_API_PASSWORD = "secret-value";
    process.env.MB3M_ACTIVITY_ID = "3";
    process.env.MB3M_PROD_API_USER = "agence";
    process.env.MB3M_PROD_API_PASSWORD = "prod-secret";
    process.env.MB3M_PROD_ACTIVITY_ID = "12";
    assert.equal(mb3mConfigured(), true);
    assert.equal(mb3mActivityId(), 12);
  });

  it("hors production, ignore les identifiants d’agence", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.MB3M_API_USER;
    delete process.env.MB3M_API_PASSWORD;
    delete process.env.MB3M_ACTIVITY_ID;
    process.env.MB3M_PROD_API_USER = "agence";
    process.env.MB3M_PROD_API_PASSWORD = "prod-secret";
    process.env.MB3M_PROD_ACTIVITY_ID = "12";
    assert.equal(mb3mRealm(), "test");
    assert.equal(mb3mConfigured(), false);
    assert.equal(mb3mActivityId(), null);
  });

  it("une preview garde la base de test même si les identifiants d’agence sont présents", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.MB3M_API_USER = "agent@partner";
    process.env.MB3M_API_PASSWORD = "secret-value";
    process.env.MB3M_ACTIVITY_ID = "3";
    process.env.MB3M_PROD_API_USER = "agence";
    process.env.MB3M_PROD_API_PASSWORD = "prod-secret";
    process.env.MB3M_PROD_ACTIVITY_ID = "12";
    assert.equal(mb3mRealm(), "test");
    assert.equal(mb3mConfigured(), true);
    assert.equal(mb3mActivityId(), 3);
  });

  it("une faute SOAP remonte son message et garde le détail pour les logs", async () => {
    arm();
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
    try {
      await assert.rejects(
        mb3mAgencyNames(async () =>
          new Response(
            `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>Nullable object must have a value.</faultstring><detail><ExceptionDetail><Message>Nullable object must have a value.</Message><StackTrace>   at System.ThrowHelper.ThrowInvalidOperationException()&#xD;   at Mb3m.Billing.ActivityVat.Rate()</StackTrace><Type>System.InvalidOperationException</Type></ExceptionDetail></detail></s:Fault></s:Body></s:Envelope>`,
            { status: 500 }
          )
        ),
        (error: unknown) => error instanceof Mb3mError && error.message === "Nullable object must have a value."
      );
    } finally {
      console.error = original;
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0], /System\.InvalidOperationException/);
    assert.match(logged[0], /ActivityVat\.Rate/);
    assert.equal(mb3mFaultDetail("<x/>"), "");
  });

  it("pose l’agence unique de la base sur le dossier et la pièce, pas quand il y en a plusieurs", async () => {
    arm();
    const agencies = (names: string[]) => async () =>
      new Response(
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetAgenciesResponse xmlns="http://schemas.mb3m.fr/Partners"><GetAgenciesResult>${names
          .map((name, index) => `<Agency><DisplayName>${name}</DisplayName><Uid>aaaaaaa${index}-0000-0000-0000-000000000000</Uid></Agency>`)
          .join("")}</GetAgenciesResult></GetAgenciesResponse></s:Body></s:Envelope>`
      );
    assert.equal(await mb3mSingleAgencyUid(agencies(["Travel Business Agency"])), "aaaaaaa0-0000-0000-0000-000000000000");
    assert.equal(await mb3mSingleAgencyUid(agencies(["Agence 1060", "Agence 1750"])), null);

    let body = "";
    const folder = await mb3mSaveFolder(
      {
        customerUid: "6759c8c7-2cb1-40a7-a9e8-91eaf71c8623",
        title: "Séjour",
        folderType: "Prestation",
        dateStart: "2026-10-08",
        dateEnd: "2026-10-11",
        agencyUid: "ba3e9d2d-c2a5-4872-b5d2-99e74b483831",
      },
      async (_url, init) => {
        body = String(init?.body);
        return new Response(
          `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FolderOperationResponse xmlns="http://schemas.mb3m.fr/Partners"><Result><Agency><Uid>ba3e9d2d-c2a5-4872-b5d2-99e74b483831</Uid></Agency><CustomerIdentity><Uid>6759c8c7-2cb1-40a7-a9e8-91eaf71c8623</Uid></CustomerIdentity><Id>01-0002000</Id><Uid>b74cb0fe-afc2-4210-92a1-202610141546</Uid></Result><ResultCode>1</ResultCode></FolderOperationResponse></s:Body></s:Envelope>`
        );
      }
    );
    assert.ok(body.includes("<Folder><Agency><Uid>ba3e9d2d-c2a5-4872-b5d2-99e74b483831</Uid></Agency><CustomerIdentity>"));
    assert.deepEqual(folder, { id: "01-0002000", uid: "b74cb0fe-afc2-4210-92a1-202610141546" });

    let invoiceBody = "";
    await mb3mAddInvoice(
      {
        folderId: "01-0002000",
        customerUid: "6759c8c7-2cb1-40a7-a9e8-91eaf71c8623",
        title: "Séjour",
        lines: [{ label: "Hôtel", quantity: 1, netPriceUnit: 100, netPriceTotal: 100, marginUnit: 10 }],
        agencyUid: "ba3e9d2d-c2a5-4872-b5d2-99e74b483831",
      },
      async (_url, init) => {
        invoiceBody = String(init?.body);
        return new Response(
          `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FolderOperationResponse xmlns="http://schemas.mb3m.fr/Partners"><Result><Invoices><Invoice><Number>2051</Number><Uid>11111111-1111-1111-1111-111111111111</Uid></Invoice></Invoices></Result><ResultCode>1</ResultCode></FolderOperationResponse></s:Body></s:Envelope>`
        );
      }
    );
    assert.ok(invoiceBody.includes("<Invoice><Agency><Uid>ba3e9d2d-c2a5-4872-b5d2-99e74b483831</Uid></Agency><CustomerIdentity>"));
    assert.ok(
      invoiceBody.includes(
        "<NetPriceUnit>100</NetPriceUnit><ProviderId>ba3e9d2d-c2a5-4872-b5d2-99e74b483831</ProviderId><Quantity>1</Quantity>"
      )
    );
  });

  it("crée une fiche et lit l’identifiant renvoyé", async () => {
    arm();
    let action = "";
    let body = "";
    let authorization = "";
    const saved = await mb3mSavePerson(
      {
        partnerId: "TBAPROBE000001",
        civility: "Mr",
        firstName: "Probe",
        name: "TRAVELBA & CIE",
        email: "probe.travelba@example.invalid",
        birthDate: "1984-03-12",
        country: "FR",
        mobileNumber: "+33600000000",
        phoneNumber: "+33100000000",
        address: {
          name: "Probe Travelba",
          line1: "1 rue du Test",
          postalCode: "75001",
          city: "Paris",
          countryCode: "FR",
        },
      },
      async (_url, init) => {
        action = String(new Headers(init?.headers).get("SOAPAction"));
        authorization = String(new Headers(init?.headers).get("Authorization"));
        body = String(init?.body);
        return new Response(
          `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><CustomerOperationResponse xmlns="http://schemas.mb3m.fr/Partners"><ResultCode>1</ResultCode><Result><Id>TBAPROBE000001</Id><Person><Name>TRAVELBA &amp; CIE</Name></Person><Uid>ac53a900-3ab4-4e41-bfce-0af005dfde72</Uid></Result></CustomerOperationResponse></s:Body></s:Envelope>`
        );
      }
    );
    assert.equal(action, '"http://schemas.mb3m.fr/Partners/ICustomerService/Save"');
    assert.equal(authorization.startsWith("Basic "), true);
    assert.equal(Buffer.from(authorization.slice(6), "base64").toString("utf8"), "agent@partner:secret-value");
    assert.equal(body.includes("secret-value"), false);
    assert.equal(body.includes("TRAVELBA &amp; CIE"), true);
    const personOrder = [
      "<Id>TBAPROBE000001</Id>",
      "<BirthDate>1984-03-12T00:00:00</BirthDate>",
      "<Civility>Mr</Civility>",
      "<Country>FR</Country>",
      "<Email>probe.travelba@example.invalid</Email>",
      "<FirstName>Probe</FirstName>",
      "<MainAddress>",
      "<MobileNumber>+33600000000</MobileNumber>",
      "<Name>TRAVELBA",
      "<PhoneNumber>+33100000000</PhoneNumber>",
    ].map((needle) => body.indexOf(needle));
    assert.ok(personOrder.every((index) => index >= 0), body);
    assert.deepEqual(personOrder, [...personOrder].sort((left, right) => left - right));
    assert.ok(body.indexOf("<Id>TBAPROBE000001</Id>") < body.indexOf("<Person>"));
    assert.equal(saved.uid, "ac53a900-3ab4-4e41-bfce-0af005dfde72");
    assert.equal(saved.partnerId, "TBAPROBE000001");
  });

  it("remonte le message quand la facture est refusée", async () => {
    arm();
    await assert.rejects(
      () =>
        mb3mAddInvoice(
          {
            folderId: "22-AAAAAAA",
            customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
            title: "Sonde",
            lines: [{ label: "Forfait", quantity: 1, netPriceUnit: 10, netPriceTotal: 10 }],
          },
          async () =>
            new Response(
              `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FolderOperationResponse xmlns="http://schemas.mb3m.fr/Partners"><Message>Prestation sans activité/prestationcomp !&#xD;\nParameter name: infoPresta</Message><ResultCode>-1</ResultCode></FolderOperationResponse></s:Body></s:Envelope>`
            )
        ),
      (error: unknown) => {
        assert.ok(error instanceof Mb3mError);
        assert.equal(error.resultCode, -1);
        assert.match(error.message, /activité/);
        return true;
      }
    );
  });

  it("ajoute Details au message quand MB3M refuse la pièce", async () => {
    arm();
    const xml = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FolderOperationResponse xmlns="http://schemas.mb3m.fr/Partners"><Message>Une erreur s'est produite durant l'enregistrement de la facture</Message><Details>Code interne -22 : Impossible de sauvegarder la pièce car une prestation de billetterie n'a pas de commission renseignée.</Details><ResultCode>-504</ResultCode></FolderOperationResponse></s:Body></s:Envelope>`;
    assert.equal(
      mb3mOperationMessage(xml),
      "Une erreur s'est produite durant l'enregistrement de la facture — Code interne -22 : Impossible de sauvegarder la pièce car une prestation de billetterie n'a pas de commission renseignée."
    );
    await assert.rejects(
      () =>
        mb3mAddInvoice(
          {
            folderId: "22-AAAAAAA",
            customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
            title: "Sonde",
            lines: [{ label: "Vol", quantity: 1, netPriceUnit: 400, netPriceTotal: 400, activityId: 2, marginUnit: 0 }],
          },
          async () => new Response(xml)
        ),
      (error: unknown) => {
        assert.ok(error instanceof Mb3mError);
        assert.equal(error.resultCode, -504);
        assert.match(error.message, /code interne -22/i);
        assert.match(error.message, /billetterie/);
        return true;
      }
    );
  });

  it("place l’activité avant le libellé et garde le dernier numéro", async () => {
    arm();
    let body = "";
    const invoice = await mb3mAddInvoice(
      {
        folderId: "22-0000025",
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        title: "Sonde",
        lines: [{ label: "Hôtel", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 3 }],
      },
      async (_url, init) => {
        body = String(init?.body);
        return new Response(
          `<s:Envelope><s:Body><FolderOperationResponse><ResultCode>1</ResultCode><Invoices><Invoice><Number>4529</Number></Invoice><Invoice><Number>4531</Number></Invoice></Invoices></FolderOperationResponse></s:Body></s:Envelope>`
        );
      }
    );
    assert.ok(body.indexOf("<ActivityId>3</ActivityId>") < body.indexOf("<Label>Hôtel</Label>"));
    assert.equal(invoice.number, "4531");
  });

  it("écrit la marge et la note dans l’ordre du schéma, et les omet sans coût pointé", async () => {
    arm();
    let body = "";
    await mb3mAddInvoice(
      {
        folderId: "22-0000025",
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        title: "Sonde",
        lines: [
          { label: "Hôtel", quantity: 1, netPriceUnit: 1200, netPriceTotal: 1200, activityId: 7, marginUnit: -50.5, note: "Fournisseur : RIAD" },
          { label: "Vol", quantity: 1, netPriceUnit: 400, netPriceTotal: 400, activityId: 2 },
        ],
      },
      async (_url, init) => {
        body = String(init?.body);
        return new Response(
          `<s:Envelope><s:Body><FolderOperationResponse><ResultCode>1</ResultCode><Invoices><Invoice><Number>4529</Number></Invoice></Invoices></FolderOperationResponse></s:Body></s:Envelope>`
        );
      }
    );
    const hotel = body.slice(body.indexOf("<InvoiceLine>"), body.indexOf("</InvoiceLine>"));
    const order = ["<ActivityId>7", "<Label>Hôtel", "<MarginUnit>-50.5", "<NetPriceTotal>1200", "<NetPriceUnit>1200", "<Note>Fournisseur : RIAD", "<Quantity>1", "<Type>Standard"].map(
      (needle) => hotel.indexOf(needle)
    );
    assert.ok(order.every((index) => index >= 0), hotel);
    assert.deepEqual(order, [...order].sort((left, right) => left - right));
    assert.equal(hotel.includes("<CommissionNetTotal>"), false);
    assert.equal(hotel.includes("<CommissionTotal>"), false);
    const flight = body.slice(body.lastIndexOf("<InvoiceLine>"));
    assert.equal(flight.includes("<MarginUnit>"), false);
    assert.equal(flight.includes("<Note>"), false);
    assert.ok(flight.includes(`<ActivityId>2</ActivityId>${commissionTags(0.01)}<Label>Vol</Label>`), flight);
  });

  it("pose un ProviderId sur chaque ligne, le défaut d’environnement avant l’agence", () => {
    const provider = "ba3e9d2d-c2a5-4872-b5d2-99e74b483831";
    const supplier = "11111111-2222-4333-8444-555555555555";
    delete process.env.VERCEL_ENV;
    delete process.env.MB3M_PROVIDER_ID;
    const bare = linesXml("InvoiceLine", [{ label: "Hôtel", quantity: 1, netPriceUnit: 81, netPriceTotal: 81, activityId: 7 }]);
    assert.equal(bare.includes("<ProviderId>"), false);
    const fromAgency = linesXml(
      "InvoiceLine",
      [
        { label: "Frais d’agence", quantity: 1, netPriceUnit: 0.01, netPriceTotal: 0.01, activityId: 22 },
        { label: "Vol", quantity: 1, netPriceUnit: 0.01, netPriceTotal: 0.01, activityId: 2, note: "Fournisseur : AIR FRANCE" },
      ],
      provider
    );
    assert.equal(fromAgency.match(/<ProviderId>/g)?.length, 2);
    assert.ok(fromAgency.includes(`<NetPriceUnit>0.01</NetPriceUnit><ProviderId>${provider}</ProviderId><Quantity>1</Quantity>`));
    assert.ok(
      fromAgency.includes(`<Note>Fournisseur : AIR FRANCE</Note><ProviderId>${provider}</ProviderId><Quantity>1</Quantity>`)
    );
    process.env.MB3M_PROVIDER_ID = supplier;
    assert.equal(mb3mDefaultProviderId(), supplier);
    const fromEnv = linesXml(
      "InvoiceLine",
      [{ label: "Hôtel", quantity: 1, netPriceUnit: 81, netPriceTotal: 81, activityId: 7, providerId: provider }],
      "22222222-2222-4222-8222-222222222222"
    );
    assert.ok(fromEnv.includes(`<ProviderId>${provider}</ProviderId>`));
    assert.equal(fromEnv.includes(supplier), false);
    process.env.VERCEL_ENV = "preview";
    process.env.MB3M_PROD_PROVIDER_ID = provider;
    assert.equal(mb3mDefaultProviderId(), supplier);
    process.env.VERCEL_ENV = "production";
    delete process.env.MB3M_PROVIDER_ID;
    assert.equal(mb3mDefaultProviderId(), provider);
  });

  it("renseigne CommissionTotal sur une billetterie, et sur l’avoir, dans l’ordre du schéma", () => {
    const base = { quantity: 1, netPriceUnit: 400, netPriceTotal: 400 };
    const air = linesXml("InvoiceLine", [{ ...base, label: "Vol", activityId: 2 }]);
    assert.ok(air.includes(`<ActivityId>2</ActivityId>${commissionTags(0.01)}<Label>Vol</Label>`));
    for (const commissionTotal of [0, null] as const) {
      const fallback = linesXml("InvoiceLine", [{ ...base, label: "Vol", activityId: 2, commissionTotal }]);
      assert.ok(fallback.includes(commissionTags(0.01)));
    }
    const priced = linesXml("InvoiceLine", [
      { ...base, label: "Vol", activityId: 2, commissionTotal: 12.5, marginUnit: 12.5 },
    ]);
    const pricedAt = [
      "<ActivityId>2",
      "<CommissionNetTotal>12.5",
      "<CommissionTaxRate>0",
      "<CommissionTotal>12.5",
      "<Label>Vol",
      "<MarginUnit>12.5",
      "<NetPriceTotal>400",
      "<NetPriceUnit>400",
      "<Quantity>1",
      "<Type>Standard",
    ].map((needle) => priced.indexOf(needle));
    assert.ok(pricedAt.every((index) => index >= 0), priced);
    assert.deepEqual(pricedAt, [...pricedAt].sort((left, right) => left - right));
    const hotel = linesXml("InvoiceLine", [{ ...base, label: "Hôtel", activityId: 7 }]);
    assert.equal(hotel.includes("<CommissionNetTotal>"), false);
    assert.equal(hotel.includes("<CommissionTotal>"), false);
    const hotelCommission = linesXml("InvoiceLine", [{ ...base, label: "Hôtel", activityId: 7, commissionTotal: 8 }]);
    assert.ok(hotelCommission.includes(`<ActivityId>7</ActivityId>${commissionTags(8)}<Label>Hôtel</Label>`));
    const credit = linesXml("CreditNoteLine", [{ ...base, label: "Avoir vol", activityId: 2 }]);
    assert.ok(credit.includes(`<CreditNoteLine><ActivityId>2</ActivityId>${commissionTags(0.01)}<Label>Avoir vol</Label>`));
    for (const activityId of [2, 5, 27]) assert.equal(mb3mTicketingActivity(activityId), true);
    assert.equal(mb3mTicketingActivity(22), false);
    assert.equal(mb3mTicketingActivity(7), false);
  });

  it("le train (activité 5) et le low cost (27) portent la commission ; Frais Billet (22) non", async () => {
    process.env.VERCEL_ENV = "production";
    const train = "11111111-1111-4111-8111-111111111111";
    const fee = "22222222-2222-4222-8222-222222222222";
    const booking = "33333333-3333-4333-8333-333333333333";
    const account = mb3mDossierLines(
      [
        {
          id: "tx-train",
          direction: "debit",
          status: "posted",
          currency: "EUR",
          amount: 362,
          label: "Train · Paris Est · Strasbourg",
          external_id: `booking:${booking}:item:${train}`,
          booking_id: booking,
        },
        {
          id: "tx-fee",
          direction: "debit",
          status: "posted",
          currency: "EUR",
          amount: 10,
          label: "Dépense · Frais Billet",
          external_id: `booking:${booking}:expense:${fee}`,
          booking_id: booking,
        },
      ],
      [
        { id: train, kind: "rail" },
        { id: fee, kind: "expense" },
      ]
    );
    assert.deepEqual(
      account.map((line) => [line.transactionId, line.activityId]),
      [
        ["tx-fee", 22],
        ["tx-train", 5],
      ]
    );
    const issued = account.map(mb3mInvoiceLine);
    assert.equal(issued.find((line) => line.label.includes("Strasbourg"))?.activityId, 5);
    assert.equal(issued.find((line) => line.label.includes("Frais Billet"))?.activityId, 22);
    assert.equal(
      issued.every((line) => line.commissionTotal == null),
      true
    );
    const xml = linesXml("InvoiceLine", issued);
    const feeXml = xml.slice(xml.indexOf("<InvoiceLine>"), xml.indexOf("</InvoiceLine>"));
    const trainXml = xml.slice(xml.lastIndexOf("<InvoiceLine>"));
    assert.ok(feeXml.includes("<ActivityId>22</ActivityId><Label>"), feeXml);
    assert.equal(feeXml.includes("<CommissionNetTotal>"), false);
    assert.equal(feeXml.includes("<CommissionTotal>"), false);
    assert.ok(trainXml.includes(`<ActivityId>5</ActivityId>${commissionTags(0.01)}`), trainXml);
    for (const activityId of [5, 27] as const) {
      const credit = linesXml("CreditNoteLine", [
        { label: "Avoir", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId },
      ]);
      assert.ok(credit.includes(`<CreditNoteLine><ActivityId>${activityId}</ActivityId>${commissionTags(0.01)}`));
    }
    arm();
    let invoiceBody = "";
    let creditBody = "";
    const ok = (number: string, kind: "Invoice" | "CreditNote") =>
      new Response(
        `<FolderOperationResponse><ResultCode>1</ResultCode>${
          kind === "Invoice"
            ? `<Invoices><Invoice><Number>${number}</Number></Invoice></Invoices>`
            : `<CreditNotes><CreditNote><Number>${number}</Number></CreditNote></CreditNotes>`
        }</FolderOperationResponse>`
      );
    await mb3mAddInvoice(
      {
        folderId: "22-0000025",
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        title: "Sonde",
        lines: issued,
      },
      async (_url, init) => {
        invoiceBody = String(init?.body);
        return ok("4542", "Invoice");
      }
    );
    await mb3mAddCreditNote(
      {
        folderId: "22-0000025",
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        folderTitle: "Sonde",
        folderType: "Prestation",
        dateStart: "2026-11-01",
        dateEnd: "2026-11-08",
        title: "Avoir",
        lines: issued,
      },
      async (_url, init) => {
        creditBody = String(init?.body);
        return ok("4543", "CreditNote");
      }
    );
    for (const body of [invoiceBody, creditBody]) {
      assert.ok(body.includes(`<ActivityId>5</ActivityId>${commissionTags(0.01)}`), body);
      const feeSlice = body.slice(body.indexOf("<ActivityId>22</ActivityId>"), body.indexOf("<ActivityId>5</ActivityId>"));
      assert.ok(feeSlice.includes("<Label>"), feeSlice);
      assert.equal(feeSlice.includes("<CommissionNetTotal>"), false);
      assert.equal(feeSlice.includes("<CommissionTotal>"), false);
    }
    const lowCost = linesXml("InvoiceLine", [
      { label: "Low cost", quantity: 1, netPriceUnit: 80, netPriceTotal: 80, activityId: 27 },
    ]);
    assert.ok(lowCost.includes(`<ActivityId>27</ActivityId>${commissionTags(0.01)}<Label>Low cost</Label>`));
  });

  it("crée un avoir sur le dossier déjà ouvert", async () => {
    arm();
    let body = "";
    let action = "";
    const note = await mb3mAddCreditNote(
      {
        folderId: "22-0000025",
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        folderTitle: "Sonde Prestation",
        folderType: "Prestation",
        dateStart: "2026-11-01",
        dateEnd: "2026-11-08",
        title: "Avoir sonde",
        lines: [{ label: "Avoir hôtel", quantity: 1, netPriceUnit: 10, netPriceTotal: 10, activityId: 3 }],
      },
      async (_url, init) => {
        body = String(init?.body);
        action = String(new Headers(init?.headers).get("SOAPAction"));
        return new Response(
          `<s:Envelope><s:Body><FolderOperationResponse><ResultCode>1</ResultCode><Number>4531</Number><CreditNotes><CreditNote><Number>4539</Number></CreditNote></CreditNotes></FolderOperationResponse></s:Body></s:Envelope>`
        );
      }
    );
    assert.equal(action, '"http://schemas.mb3m.fr/Partners/IFolderService/Save"');
    assert.equal(body.includes("secret-value"), false);
    assert.ok(body.includes("<Id>22-0000025</Id>"));
    assert.ok(body.includes("<CreditNoteLine>"));
    assert.equal(note.number, "4539");
  });

  it("retrouve une fiche et la liste des agences", async () => {
    arm();
    const found = await mb3mFindPersons({ email: "probe.travelba@example.invalid" }, async () => {
      return new Response(
        `<CustomerFindResponse><Customers><CustomerSummary><Uid>abc</Uid><AltName>Probe</AltName><IsCompany>false</IsCompany><Name>TRAVELBA</Name></CustomerSummary></Customers><TotalCount>1</TotalCount></CustomerFindResponse>`
      );
    });
    assert.equal(found.total, 1);
    assert.equal(found.customers[0]?.name, "TRAVELBA");
    const names = await mb3mAgencyNames(async () => {
      return new Response(`<AgencyCollection><Agency><DisplayName>Agence 1750</DisplayName></Agency></AgencyCollection>`);
    });
    assert.deepEqual(names, ["Agence 1750"]);
  });

  it("distingue l’identifiant du dossier de celui du client", async () => {
    arm();
    const folder = await mb3mSaveFolder(
      {
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        title: "Sonde Travelba",
        folderType: "Production",
        dateStart: "2026-11-01",
        dateEnd: "2026-11-08",
        destinationIso: "ES",
      },
      async () =>
        new Response(
          `<FolderOperationResponse><ResultCode>1</ResultCode><CustomerIdentity><Uid>ac53a900-3ab4-4e41-bfce-0af005dfde72</Uid></CustomerIdentity><FolderType>Production</FolderType><Id>22-AAAAAAA</Id><Uid>c9ff46e3-d7f5-49db-aa1a-202610121322</Uid></FolderOperationResponse>`
        )
    );
    assert.equal(folder.id, "22-AAAAAAA");
    assert.equal(folder.uid, "c9ff46e3-d7f5-49db-aa1a-202610121322");
    assert.equal(mb3mXmlText("<Message>ok</Message>", "Message"), "ok");
  });

  it("crée une société sans y mettre le SIRET", async () => {
    arm();
    let body = "";
    const saved = await mb3mSaveCompany(
      {
        partnerId: "COMPANY0000001",
        name: "Travelba & Cie",
        commercialName: "Travelba",
        email: "compta@example.invalid",
        phoneNumber: "+33611111111",
        address: {
          name: "Travelba & Cie",
          line1: "2 rue de la Facture",
          postalCode: "75002",
          city: "Paris",
          countryCode: "FR",
        },
      },
      async (_url, init) => {
        body = String(init?.body);
        return new Response(
          `<CustomerOperationResponse><ResultCode>1</ResultCode><Id>COMPANY0000001</Id><Uid>company-uid</Uid></CustomerOperationResponse>`
        );
      }
    );
    assert.equal(saved.uid, "company-uid");
    assert.equal(mb3mCivilityFromSex("M"), "Mr");
    assert.equal(mb3mCivilityFromSex("f"), "Mme");
    assert.equal(mb3mCivilityFromSex("X"), "Unknown");
    assert.equal(mb3mCivilityFromSex(null), "Unknown");
    const companyOrder = [
      "<CommercialName>Travelba</CommercialName>",
      "<Email>compta@example.invalid</Email>",
      "<MainAddress>",
      "<Name>Travelba &amp; Cie</Name>",
      "<PhoneNumber>+33611111111</PhoneNumber>",
      "</Company><Id>COMPANY0000001</Id>",
    ].map((needle) => body.indexOf(needle));
    assert.ok(companyOrder.every((index) => index >= 0), body);
    assert.deepEqual(companyOrder, [...companyOrder].sort((left, right) => left - right));
    assert.equal(body.toLowerCase().includes("siret"), false);
    assert.equal(body.toLowerCase().includes("tva"), false);
    assert.equal(body.includes("secret-value"), false);
  });

  it("n’envoie que le prénom et le nom des voyageurs", async () => {
    arm();
    let body = "";
    await mb3mAddInvoice(
      {
        folderId: "22-0000025",
        customerUid: "ac53a900-3ab4-4e41-bfce-0af005dfde72",
        title: "Avoriaz",
        lines: [{ label: "Avoriaz", quantity: 1, netPriceUnit: 840, netPriceTotal: 840, activityId: 3 }],
        travelers: [{ firstName: "Ada", name: "Lovelace" }],
      },
      async (_url, init) => {
        body = String(init?.body);
        return new Response(`<FolderOperationResponse><ResultCode>1</ResultCode><Invoice><Number>4531</Number><Uid>piece-uid</Uid></Invoice></FolderOperationResponse>`);
      }
    );
    assert.ok(body.indexOf("</Lines>") < body.indexOf("<Travelers>"));
    assert.ok(body.includes("<FirstName>Ada</FirstName>"));
    assert.ok(body.includes("<Name>Lovelace</Name>"));
    assert.equal(body.toLowerCase().includes("passport"), false);
    assert.equal(body.toLowerCase().includes("iban"), false);
  });

  it("accepte le PDF même quand le code de résultat vaut 0", async () => {
    arm();
    let action = "";
    let body = "";
    const pdf = Buffer.from("%PDF-1.4\nfacture").toString("base64");
    const rendered = await mb3mRenderPiece({ number: "4531" }, async (_url, init) => {
      action = String(new Headers(init?.headers).get("SOAPAction"));
      body = String(init?.body);
      return new Response(
        `<RenderResponse><ResultCode>0</ResultCode><ContentType>application/pdf</ContentType><Payload>${pdf}</Payload><SuggestedFilename>Facture.pdf</SuggestedFilename></RenderResponse>`
      );
    });
    assert.equal(action, '"http://schemas.mb3m.fr/Partners/IRenderService/Piece"');
    assert.ok(body.indexOf("<Format>Pdf</Format>") < body.indexOf("<Number>4531</Number>"));
    assert.equal(rendered.bytes.subarray(0, 4).toString("utf8"), "%PDF");
    assert.equal(rendered.contentType, "application/pdf");
    assert.throws(
      () => mb3mPdfBytes(`<RenderResponse><ResultCode>-1</ResultCode><Message>Refus</Message></RenderResponse>`),
      (error: unknown) => {
        assert.ok(error instanceof Mb3mError);
        assert.equal(error.message, "Refus");
        return true;
      }
    );
  });
});

describe("état d’une pièce MB3M", () => {
  it("distingue une facture émise d’une facture seulement numérotée", () => {
    assert.equal(
      mb3mPieceState(`<Piece><Number>4540</Number><Amount>1</Amount><TotalCount>1</TotalCount></Piece>`),
      "open"
    );
    assert.equal(
      mb3mPieceState(
        `<Piece><Number>4531</Number><DatePrint>2026-10-12T11:59:25.08+00:00</DatePrint><TotalCount>1</TotalCount></Piece>`
      ),
      "printed"
    );
    assert.equal(mb3mPieceState(`<FolderFindPiecesResult><TotalCount>0</TotalCount></FolderFindPiecesResult>`), "missing");
  });
});
