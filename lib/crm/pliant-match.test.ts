import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPliantToCustomer,
  billingCustomersByCard,
  pliantAgencyCardLabel,
  pliantLedgerDraft,
  pliantMatchReasonLabel,
  scorePliantMatches,
  suggestedCustomerId,
  type PliantLedgerRow,
  type PliantMatchCustomer,
} from "./pliant-match";

function customer(partial: PliantMatchCustomer): PliantMatchCustomer {
  return {
    id: partial.id,
    first_name: partial.first_name,
    last_name: partial.last_name,
    company_name: partial.company_name ?? null,
    usage_name: partial.usage_name ?? null,
  };
}

function expense(partial: Partial<PliantLedgerRow> & Pick<PliantLedgerRow, "id">): PliantLedgerRow {
  return {
    id: partial.id,
    pliant_transaction_id: partial.pliant_transaction_id || `pl-${partial.id}`,
    card_id: partial.card_id ?? null,
    type: partial.type ?? "PURCHASE",
    status: partial.status ?? "BOOKED",
    merchant: partial.merchant ?? "TRANSAVIA",
    billing_cents: partial.billing_cents ?? 36409,
    billing_currency: partial.billing_currency ?? "EUR",
    booked_at: partial.booked_at ?? "2026-09-12T10:00:00Z",
    card_label: partial.card_label ?? null,
    card_last4: partial.card_last4 ?? "4235",
    match_status: partial.match_status ?? "unmatched",
  };
}

describe("pliant-match", () => {
  const people = [
    customer({ id: "1", first_name: "Camille", last_name: "Renard" }),
    customer({ id: "2", first_name: "Alice", last_name: "Martin", company_name: "Martin SARL" }),
    customer({ id: "3", first_name: "Inès", last_name: "Zigler" }),
    customer({ id: "4", first_name: "Slimane", last_name: "Bensaid" }),
    customer({ id: "5", first_name: "Georges", last_name: "Morel" }),
    customer({ id: "6", first_name: "Simon", last_name: "Albilia" }),
    customer({ id: "7", first_name: "Raphael", last_name: "Zerdoun" }),
  ];

  it("impute un nom complet unique", () => {
    const result = scorePliantMatches({ card_label: "Camille Renard" }, people);
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "full_name");
  });

  it("impute un nom de famille unique", () => {
    const result = scorePliantMatches({ card_label: "Zigler" }, people);
    assert.equal(result.autoCustomerId, "3");
    assert.equal(result.candidates[0]?.reason, "unique_last_name");
  });

  it("n’impute pas deux clients du même nom", () => {
    const result = scorePliantMatches({ card_label: "Martin" }, [
      customer({ id: "a", first_name: "Alice", last_name: "Martin" }),
      customer({ id: "b", first_name: "Paul", last_name: "Martin" }),
    ]);
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.every((c) => c.score < 90));
  });

  it("compare des mots entiers : Martineau n’est pas Martin, Leroy n’est pas Roy", () => {
    const martin = scorePliantMatches({ card_label: "Jean Martineau" }, [
      customer({ id: "a", first_name: "Jean", last_name: "Martin" }),
      customer({ id: "b", first_name: "Alice", last_name: "Boukris" }),
    ]);
    assert.equal(martin.autoCustomerId, null);
    assert.equal(martin.candidates.length, 0);
    for (const label of ["Leroy", "Royal Hotel"]) {
      const roy = scorePliantMatches({ card_label: label }, [
        customer({ id: "a", first_name: "Paul", last_name: "Roy" }),
        customer({ id: "b", first_name: "Alice", last_name: "Boukris" }),
      ]);
      assert.equal(roy.autoCustomerId, null, label);
      assert.equal(roy.candidates.length, 0, label);
    }
  });

  it("deux homonymes : aucune présélection", () => {
    const result = scorePliantMatches({ card_label: "Dupont" }, [
      customer({ id: "a", first_name: "Alice", last_name: "Dupont" }),
      customer({ id: "b", first_name: "Paul", last_name: "Dupont" }),
    ]);
    assert.equal(suggestedCustomerId(result.candidates), "");
    assert.equal(result.autoCustomerId, null);
    const sure = scorePliantMatches({ card_label: "Paul Dupont" }, [
      customer({ id: "a", first_name: "Alice", last_name: "Dupont" }),
      customer({ id: "b", first_name: "Paul", last_name: "Dupont" }),
    ]);
    assert.equal(suggestedCustomerId(sure.candidates), "b");
  });

  it("laisse les cartes agence sans proposition", () => {
    for (const label of ["AMADEUS", "Pliant Platform Fee", "raf", "Platform fee"]) {
      const result = scorePliantMatches({ card_label: label }, people);
      assert.equal(pliantAgencyCardLabel(label), true, label);
      assert.equal(result.autoCustomerId, null, label);
      assert.equal(result.candidates.length, 0, label);
    }
  });

  it("ignore le porteur agence quand le libellé est une carte interne", () => {
    const result = scorePliantMatches({ card_label: "AMADEUS" }, [
      customer({ id: "staff", first_name: "Benjamin", last_name: "Boukris" }),
    ]);
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates.length, 0);
  });

  it("propose un prénom seul sans l’imputer", () => {
    const slimane = scorePliantMatches({ card_label: "Slimane" }, people);
    assert.equal(slimane.autoCustomerId, null);
    assert.equal(slimane.candidates[0]?.customer_id, "4");
    assert.equal(slimane.candidates[0]?.reason, "first_name");
    assert.ok((slimane.candidates[0]?.score || 0) < 90);

    const georges = scorePliantMatches({ card_label: "georges" }, people);
    assert.equal(georges.autoCustomerId, null);
    assert.equal(georges.candidates[0]?.customer_id, "5");
  });

  it("propose une graphie proche sans l’imputer", () => {
    const result = scorePliantMatches({ card_label: "Simon Albilla" }, people);
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates[0]?.customer_id, "6");
    assert.equal(result.candidates[0]?.reason, "partial");
    assert.ok((result.candidates[0]?.score || 0) < 90);
  });

  it("reconnaît un prénom composé et un nom presque identique, sans imputer", () => {
    const result = scorePliantMatches({ card_label: "Simon Albilla" }, [
      customer({ id: "6", first_name: "Simon, Iony", last_name: "Albilia" }),
      customer({ id: "2", first_name: "Alice", last_name: "Martin" }),
    ]);
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates[0]?.customer_id, "6");
    assert.ok((result.candidates[0]?.score || 0) < 90);
  });

  it("retrouve le nom complet malgré un deuxième prénom", () => {
    const result = scorePliantMatches({ card_label: "Camille Renard" }, [
      customer({ id: "1", first_name: "Camille Marie", last_name: "Renard" }),
    ]);
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "full_name");
  });

  it("impute le payeur du dossier quand la carte de séjour est unique", () => {
    const result = scorePliantMatches({ card_label: null }, people, { linkedCustomerIds: ["2"] });
    assert.equal(result.autoCustomerId, "2");
    assert.equal(result.candidates[0]?.reason, "booking");
  });

  it("n’impute pas si le libellé et le dossier désignent deux clients", () => {
    const result = scorePliantMatches({ card_label: "Camille Renard" }, people, { linkedCustomerIds: ["2"] });
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates.length, 2);
  });

  it("regroupe les payeurs par carte de séjour", () => {
    const map = billingCustomersByCard(
      [
        { pliant_card_id: "card-a", booking_id: "b1" },
        { pliant_card_id: "card-a", booking_id: "b1" },
        { pliant_card_id: "card-b", booking_id: "b2" },
      ],
      [
        { id: "b1", billing_customer_id: "1" },
        { id: "b2", billing_customer_id: "2" },
      ]
    );
    assert.deepEqual(map.get("card-a"), ["1"]);
    assert.deepEqual(map.get("card-b"), ["2"]);
  });

  it("ne poste ni un refus, ni un montant nul, ni une vérification", () => {
    assert.equal(pliantLedgerDraft(expense({ id: "d", status: "DECLINED" })), null);
    assert.equal(pliantLedgerDraft(expense({ id: "p", status: "PENDING" })), null);
    assert.equal(pliantLedgerDraft(expense({ id: "z", billing_cents: 0 })), null);
    assert.equal(pliantLedgerDraft(expense({ id: "i", type: "STATUS_INQUIRY", status: "CONFIRMED" })), null);
    const refund = pliantLedgerDraft(expense({ id: "r", type: "REFUND", status: "CONFIRMED", billing_cents: -1200 }));
    assert.equal(refund?.direction, "credit");
    assert.equal(refund?.kind, "refund");
    assert.equal(refund?.amount, 12);
  });

  it("décrit l’achat comptabilisé", () => {
    const draft = pliantLedgerDraft(expense({ id: "a", card_label: "Camille Renard", merchant: "TRANSAVIA" }));
    assert.equal(draft?.direction, "debit");
    assert.equal(draft?.kind, "card_payment");
    assert.equal(draft?.amount, 364.09);
    assert.equal(draft?.label, "Dépense Pliant · TRANSAVIA · carte Camille Renard •••• 4235");
    assert.equal(pliantMatchReasonLabel("first_name"), "Prénom");
  });

  it("écrit un débit source pliant, sans toucher un rapprochement déjà fait", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const admin = {
      from(table: string) {
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, row: payload });
            const result = { data: { id: "tx-1", ...payload }, error: null };
            return { select: () => ({ single: async () => result }) };
          },
          update(payload: Record<string, unknown>) {
            inserts.push({ table, row: payload });
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
    const row = expense({ id: "inbox-1", pliant_transaction_id: "pl-1000", card_label: "Camille Renard" });
    const result = await applyPliantToCustomer(admin, row, "customer-1");
    assert.equal(result.ok, true);
    assert.equal(inserts[0]?.table, "crm_transactions");
    assert.equal(inserts[0]?.row.direction, "debit");
    assert.equal(inserts[0]?.row.kind, "card_payment");
    assert.equal(inserts[0]?.row.source, "pliant");
    assert.equal(inserts[0]?.row.external_id, "pl-1000");
    assert.equal(inserts[0]?.row.amount, 364.09);
    assert.equal(inserts[0]?.row.booking_id, null);
    assert.equal(inserts[1]?.row.match_status, "matched");
    assert.equal(inserts[1]?.row.customer_id, "customer-1");

    const linked = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: { booking_id: "booking-9" } }) };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, row: payload });
            const result = { data: { id: "tx-2", ...payload }, error: null };
            return { select: () => ({ single: async () => result }) };
          },
          update(payload: Record<string, unknown>) {
            inserts.push({ table, row: payload });
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
    const stay = await applyPliantToCustomer(
      linked,
      expense({ id: "inbox-2", pliant_transaction_id: "pl-2000", card_id: "card-stay" }),
      "customer-1"
    );
    assert.equal(stay.ok, true);
    assert.equal(inserts.at(-2)?.row.booking_id, "booking-9");

    const again = await applyPliantToCustomer(admin, { ...row, match_status: "matched" }, "customer-1");
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.error, "already_matched");
  });
});
