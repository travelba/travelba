import assert from "node:assert/strict";
import test from "node:test";
import { statementPdfResponse } from "./statement-send";
import {
  isStatementDownloadName,
  statementContentDisposition,
  statementExportName,
  statementFilenameFromDisposition,
  statementParisMonth,
} from "./statement-filename";

const NOVEMBER = { month: 11, year: 2026 };

test("le nom reprend le nom de famille et le mois de la période", () => {
  const name = statementExportName({ lastName: "Khiari", companyName: "Khiari SAS" }, { period: NOVEMBER });
  assert.equal(name, "Relevé de compte TBA - Khiari - Novembre 2026.pdf");
  assert.equal(isStatementDownloadName(name), true);
});

test("les accents du nom et du mois restent", () => {
  assert.equal(
    statementExportName({ last_name: "Bélanger" }, { period: { month: 8, year: 2026 } }),
    "Relevé de compte TBA - Bélanger - Août 2026.pdf"
  );
  assert.equal(
    statementExportName({ last_name: "Cœur" }, { period: { month: 2, year: 2026 } }),
    "Relevé de compte TBA - Cœur - Février 2026.pdf"
  );
  assert.equal(
    statementExportName({ last_name: "Noël" }, { period: { month: 12, year: 2024 } }),
    "Relevé de compte TBA - Noël - Décembre 2024.pdf"
  );
});

test("sans nom de famille, le nom de la société est pris", () => {
  assert.equal(
    statementExportName({ lastName: "  ", companyName: "Atelier L'Étoile" }, { period: NOVEMBER }),
    "Relevé de compte TBA - Atelier L'Étoile - Novembre 2026.pdf"
  );
  assert.equal(
    statementExportName({ last_name: null, company_name: "RB&A" }, { period: NOVEMBER, extension: "pdf" }),
    "Relevé de compte TBA - RB&A - Novembre 2026.pdf"
  );
});

test("sans nom du tout, le fichier reste nommable", () => {
  assert.equal(
    statementExportName({}, { period: NOVEMBER }),
    "Relevé de compte TBA - Client - Novembre 2026.pdf"
  );
});

test("les caractères interdits sortent, les accents restent", () => {
  assert.equal(
    statementExportName({ lastName: "Khiari/Ben Ali: *?" }, { period: NOVEMBER }),
    "Relevé de compte TBA - Khiari Ben Ali - Novembre 2026.pdf"
  );
  assert.equal(
    statementExportName({ lastName: "Khiari\r\n\"Dupond\\" }, { period: NOVEMBER }),
    "Relevé de compte TBA - Khiari Dupond - Novembre 2026.pdf"
  );
  const name = statementExportName({ companyName: "Foo..Bar/Baz" }, { period: NOVEMBER });
  assert.equal(name.includes(".."), false);
  assert.equal(name.includes("/"), false);
  assert.equal(isStatementDownloadName(name), true);
});

test("sans période, le mois est celui de l’export à Paris", () => {
  const before = new Date("2026-10-31T22:30:00.000Z");
  const after = new Date("2026-10-31T23:30:00.000Z");
  assert.deepEqual(statementParisMonth(before), { year: 2026, month: 10 });
  assert.deepEqual(statementParisMonth(after), { year: 2026, month: 11 });
  assert.equal(
    statementExportName({ lastName: "Khiari" }, { issuedAt: before }),
    "Relevé de compte TBA - Khiari - Octobre 2026.pdf"
  );
  assert.equal(
    statementExportName({ lastName: "Khiari" }, { issuedAt: after }),
    "Relevé de compte TBA - Khiari - Novembre 2026.pdf"
  );
  assert.equal(
    statementExportName({ lastName: "Khiari" }, { issuedAt: new Date("2026-07-31T22:30:00.000Z") }),
    "Relevé de compte TBA - Khiari - Août 2026.pdf"
  );
});

test("une période illisible retombe sur le mois de l’export", () => {
  assert.equal(
    statementExportName(
      { lastName: "Khiari" },
      { period: { month: 13, year: 2026 }, issuedAt: new Date("2026-03-15T12:00:00.000Z") }
    ),
    "Relevé de compte TBA - Khiari - Mars 2026.pdf"
  );
});

test("une autre extension garde le même libellé", () => {
  assert.equal(
    statementExportName({ lastName: "Khiari" }, { period: NOVEMBER, extension: "CSV" }),
    "Relevé de compte TBA - Khiari - Novembre 2026.csv"
  );
  assert.equal(
    isStatementDownloadName("Relevé de compte TBA - Khiari - Novembre 2026.csv"),
    false
  );
});

test("l’en-tête garde les accents dans filename* et un repli ASCII", () => {
  const name = "Relevé de compte TBA - Cœur - Août 2026.pdf";
  const header = statementContentDisposition(name);
  assert.match(header, /^attachment; filename="Releve de compte TBA - Coeur - Aout 2026.pdf"; /);
  assert.match(header, /filename\*=UTF-8''Relev%C3%A9%20de%20compte%20TBA%20-%20C%C5%93ur%20-%20Ao%C3%BBt%202026\.pdf$/);
  assert.equal(header.includes("\n"), false);
  assert.equal(header.includes("\r"), false);
  const quoted = header.match(/filename="([^"]*)"/)?.[1] || "";
  assert.equal(/[^\x20-\x7E]/.test(quoted), false);
  assert.equal(statementFilenameFromDisposition(header), name);
});

test("le bouton préfère filename* au repli ASCII", () => {
  const header =
    'attachment; filename="Releve de compte TBA - Belanger - Aout 2026.pdf"; filename*=UTF-8\'\'Relev%C3%A9%20de%20compte%20TBA%20-%20B%C3%A9langer%20-%20Ao%C3%BBt%202026.pdf';
  assert.equal(
    statementFilenameFromDisposition(header),
    "Relevé de compte TBA - Bélanger - Août 2026.pdf"
  );
  assert.equal(statementFilenameFromDisposition(null), "Releve-de-compte.pdf");
  assert.equal(
    statementFilenameFromDisposition('attachment; filename="Releve-de-compte.pdf"'),
    "Releve-de-compte.pdf"
  );
});

test("la réponse PDF annonce ce nom, accents compris", () => {
  const name = statementExportName({ lastName: "Khiari" }, { period: NOVEMBER });
  const response = statementPdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), name);
  const header = response.headers.get("content-disposition");
  assert.equal(statementFilenameFromDisposition(header), name);
  assert.match(header || "", /filename="Releve de compte TBA - Khiari - Novembre 2026.pdf"/);
  assert.match(header || "", /filename\*=UTF-8''/);
});

test("un nom hors format n’est pas accepté comme pièce WhatsApp", () => {
  assert.equal(isStatementDownloadName("Releve-de-compte.pdf"), false);
  assert.equal(isStatementDownloadName("Relevé de compte TBA - Khiari - novembre 2026.pdf"), false);
  assert.equal(isStatementDownloadName("../Relevé de compte TBA - Khiari - Novembre 2026.pdf"), false);
  assert.equal(isStatementDownloadName("Relevé de compte TBA - Khiari - Novembre 2026.pdf\r\nX"), false);
});
