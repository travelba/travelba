import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FrenchPassportTrip } from "./visa-trip";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") {
    return {
      useRouter() {
        return { refresh() {} };
      },
    };
  }
  return load.call(this, request, parent, isMain);
};

const trip: FrenchPassportTrip = {
  hasFlight: true,
  needsFormality: true,
  entries: [
    {
      iso: "US",
      name: "États-Unis",
      status: "authorization",
      formality: "ESTA",
      applyUrl: "https://esta.cbp.dhs.gov/",
    },
  ],
  unknownIatas: [],
  unknownCountries: [],
  passengers: 1,
  amount: 25,
  asOf: "2026-01-01",
};

test("Visa est une ligne des services proposés, éteinte tant que l’agence ne l’active pas", async () => {
  const { ServiceOfferToggles } = await import("../../components/admin/ServiceOfferToggles");
  const html = renderToStaticMarkup(
    createElement(ServiceOfferToggles, {
      bookingId: "dossier",
      chauffeur: false,
      greeter: false,
      checkin: false,
      visa: false,
      hasFlight: true,
    })
  );
  assert.match(html, /Services proposés/);
  assert.match(html, /Rien n’est proposé au client tant que vous ne l’activez pas/);
  assert.match(html, /Visa/);
  assert.match(html, /L’agence dépose la formalité/);
  assert.match(html, /25 € par passager/);
  assert.match(html, /aria-label="Proposer Visa"/);
  assert.match(html, /aria-checked="false"/);
  assert.equal(html.split('role="switch"').length - 1, 4);
});

test("le client ne voit la demande que lorsque Visa est proposé", async () => {
  const { VisaJourney } = await import("../../components/crm/VisaJourney");
  const hidden = renderToStaticMarkup(
    createElement(VisaJourney, {
      variant: "client",
      bookingId: "dossier",
      reference: "TB-1",
      trip,
      requests: [],
      travelers: [],
      documents: [],
      visaBooked: false,
      showReceived: false,
      proposed: false,
    })
  );
  assert.doesNotMatch(hidden, /L’agence s’en charge/);
  assert.doesNotMatch(hidden, /ESTA/);

  const shown = renderToStaticMarkup(
    createElement(VisaJourney, {
      variant: "client",
      bookingId: "dossier",
      reference: "TB-1",
      trip,
      requests: [],
      travelers: [],
      documents: [],
      visaBooked: false,
      showReceived: false,
      proposed: true,
    })
  );
  assert.match(shown, /ESTA/);
  assert.match(shown, /L’agence s’en charge/);

  const admin = renderToStaticMarkup(
    createElement(VisaJourney, {
      variant: "admin",
      bookingId: "dossier",
      reference: "TB-1",
      trip,
      requests: [],
      travelers: [],
      documents: [],
      visaBooked: false,
      showReceived: false,
      proposed: true,
    })
  );
  assert.doesNotMatch(admin, /L’agence s’en charge/);
});
