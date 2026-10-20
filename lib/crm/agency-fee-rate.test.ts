import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyFeeRateColumn,
  agencyFeeRateField,
  agencyFeeSourceLabel,
  coerceAgencyFeeRate,
  formatAgencyFeePercent,
  parseStoredAgencyFeeRate,
  resolveAgencyFeeRate,
} from "./agency-fee-rate";
import { agencyFeeFromGross } from "./money";
import { agencyCommissionAmount, bookingMetaError, bookingMetaPatch } from "./bookings";
import { AGENCY_FEE_LABEL } from "./types";

test("le taux stocké accepte le numeric Postgres et refuse un autre pourcentage", () => {
  assert.equal(parseStoredAgencyFeeRate("0.0750"), 0.075);
  assert.equal(parseStoredAgencyFeeRate("7,5"), 0.075);
  assert.equal(parseStoredAgencyFeeRate(0.05), 0.05);
  assert.equal(parseStoredAgencyFeeRate(null), null);
  assert.equal(parseStoredAgencyFeeRate("0.1200"), null);
  assert.equal(coerceAgencyFeeRate("0.12"), 0.1);
  assert.equal(formatAgencyFeePercent(0.075), "7,5 %");
  assert.equal(formatAgencyFeePercent(0.05), "5 %");
  assert.equal(agencyFeeRateColumn(0.075), "0.0750");
  assert.equal(agencyFeeRateColumn(null), null);
});

test("la saisie n’accepte que 10, 7,5 et 5, ou l’héritage", () => {
  assert.deepEqual(agencyFeeRateField("7,5 %"), { rate: 0.075 });
  assert.deepEqual(agencyFeeRateField("compte"), { rate: null });
  assert.deepEqual(agencyFeeRateField("defaut"), { rate: null });
  const refused = agencyFeeRateField("12 %");
  assert.equal("error" in refused, true);
  if ("error" in refused) assert.equal(refused.error, "Commission d’agence : 10 %, 7,5 % ou 5 %.");
});

test("le dossier gagne, sinon le compte facturé, sinon le voyageur, sinon 10 %", () => {
  const parent = { id: "parent", agency_fee_rate: "0.0500", company_role: "admin" };
  const member = {
    id: "member",
    agency_fee_rate: null,
    company_role: "member",
    billing_parent_id: "parent",
  };
  assert.deepEqual(
    resolveAgencyFeeRate({ bookingRate: "0.0750", billing: parent, traveler: member, accounts: [parent, member] }),
    { rate: 0.075, source: "dossier" }
  );
  assert.deepEqual(resolveAgencyFeeRate({ bookingRate: null, billing: member, traveler: member, accounts: [parent, member] }), {
    rate: 0.05,
    source: "compte",
  });
  assert.deepEqual(
    resolveAgencyFeeRate({
      bookingRate: null,
      billing: { id: "payer", agency_fee_rate: null, company_role: null },
      traveler: { id: "traveler", agency_fee_rate: "0.0750" },
    }),
    { rate: 0.075, source: "compte" }
  );
  assert.deepEqual(resolveAgencyFeeRate({}), { rate: 0.1, source: "defaut" });
  assert.equal(agencyFeeSourceLabel("dossier"), "ce dossier");
});

test("la commission suit le taux et le libellé client ne montre pas le pourcentage", () => {
  assert.equal(AGENCY_FEE_LABEL, "Commission d’agence");
  assert.equal(agencyFeeFromGross(1000), 100);
  assert.equal(agencyFeeFromGross(1000, 0.075), 75);
  assert.equal(agencyFeeFromGross(1000, 0.05), 50);
  assert.equal(agencyFeeFromGross(1000, 0.12), 100);
  assert.equal(agencyCommissionAmount({ enabled: true, status: "confirmed", base: 2000, rate: 0.05 }), 100);
  assert.equal(agencyCommissionAmount({ enabled: false, status: "confirmed", base: 2000, rate: 0.05 }), 0);
});

test("un enregistrement n’écrit le taux que s’il est envoyé, et le rejette s’il est hors choix", () => {
  assert.equal("agency_fee_rate" in bookingMetaPatch({ title: "Rome" }), false);
  assert.equal(bookingMetaPatch({ agency_fee_rate: "compte" }).agency_fee_rate, null);
  assert.equal(bookingMetaPatch({ agency_fee_rate: "7,5" }).agency_fee_rate, "0.0750");
  assert.equal(bookingMetaError({ title: "Rome" }), null);
  assert.match(bookingMetaError({ agency_fee_rate: "12" }) || "", /7,5/);
});
