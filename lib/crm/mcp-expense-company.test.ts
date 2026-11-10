import assert from "node:assert/strict";
import test from "node:test";
import { describeExpenseCompany, parseExpenseCompanyRequest, societeDepense } from "./mcp-expense-company";
import { McpWriteError } from "./mcp-write";

const DOSSIER = "22222222-2222-4222-8222-222222222222";
const CARTE = "33333333-3333-4333-8333-333333333333";
const RBA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const companies = [
  { id: RBA, company_name: "RB&A" },
  { id: PRO, company_name: "Pro" },
];

const loaded = {
  dossier_id: DOSSIER,
  reference: "TB-9",
  customer_id: "11111111-1111-4111-8111-111111111111",
  billing_customer_id: null,
  libelle: "Transfert",
  companies,
  bookingCompanyId: RBA,
  itemCompanyId: null,
};

test("la société d’une dépense se décrit sans écrire", () => {
  const described = describeExpenseCompany({
    libelle: "Transfert",
    companies,
    bookingCompanyId: RBA,
    itemCompanyId: null,
    nextCompanyId: PRO,
  });
  assert.equal(described.avant.suit_le_voyage, true);
  assert.equal(described.societe, "Pro");
  assert.equal(described.suit_le_voyage, false);
  assert.equal(described.societe_voyage, "RB&A");
  assert.equal(described.societes.length, 2);
});

test("une seule société ne se choisit pas", () => {
  assert.throws(
    () =>
      describeExpenseCompany({
        libelle: "Transfert",
        companies: [companies[0]],
        bookingCompanyId: RBA,
        itemCompanyId: null,
        nextCompanyId: RBA,
      }),
    /suit le voyage/
  );
});

test("la demande exige une société ou le voyage, pas les deux", () => {
  assert.throws(() => parseExpenseCompanyRequest({ dossier_id: DOSSIER, carte_id: CARTE }), /société/);
  assert.throws(
    () => parseExpenseCompanyRequest({ dossier_id: DOSSIER, carte_id: CARTE, societe_id: PRO, suivre_voyage: true }),
    /pas les deux/
  );
  const follow = parseExpenseCompanyRequest({ dossier_id: DOSSIER, carte_id: CARTE, suivre_voyage: true });
  assert.equal(follow.societeId, null);
});

test("sans confirmer la société d’une dépense n’est pas écrite", async () => {
  let written = 0;
  const preview = (await societeDepense(
    { dossier_id: DOSSIER, carte_id: CARTE, societe_id: PRO },
    { load: async () => loaded, write: async () => { written += 1; } }
  )) as { apercu: boolean; ecrit: boolean; envoye: boolean; societe: string | null };
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(preview.envoye, false);
  assert.equal(preview.societe, "Pro");
  assert.equal(written, 0);

  const done = (await societeDepense(
    { dossier_id: DOSSIER, carte_id: CARTE, suivre_voyage: true, confirmer: true },
    { load: async () => ({ ...loaded, itemCompanyId: PRO }), write: async () => { written += 1; } }
  )) as { ecrit: boolean; apercu: boolean; suit_le_voyage: boolean };
  assert.equal(done.ecrit, true);
  assert.equal(done.apercu, false);
  assert.equal(done.suit_le_voyage, true);
  assert.equal(written, 1);
});

test("une société hors compte est refusée avant l’écriture", async () => {
  let written = 0;
  await assert.rejects(
    () =>
      societeDepense(
        { dossier_id: DOSSIER, carte_id: CARTE, societe_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", confirmer: true },
        { load: async () => loaded, write: async () => { written += 1; } }
      ),
    /compte facturé/
  );
  assert.equal(written, 0);
  await assert.rejects(
    () => societeDepense({ dossier_id: DOSSIER, carte_id: CARTE, confirmer: "oui" }, { load: async () => loaded }),
    McpWriteError
  );
});
