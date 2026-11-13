import { NextResponse } from "next/server";
import {
  Mb3mError,
  escapeMb3mXml,
  mb3mAgencyNames,
  mb3mOperationMessage,
  mb3mRealm,
  mb3mSaveCompany,
  mb3mSoap,
  mb3mXmlText,
} from "@/lib/crm/mb3m";

const LINE = 'Rr. "Tirana", Arberia III, Lokali 12-1';

function allowed(request: Request) {
  if (mb3mRealm() !== "test") return false;
  const expected = (process.env.MB3M_PROBE_TOKEN || "").trim();
  if (!expected) return false;
  return request.headers.get("x-mb3m-probe") === expected;
}

function rawCompanyXml(name: string) {
  const safe = escapeMb3mXml(name);
  const line = escapeMb3mXml(LINE);
  return `<CustomerSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Customer><Company><CommercialName>${safe}</CommercialName><MainAddress><Name>${safe}</Name><Line1>${line}</Line1><PostalCode>10000</PostalCode><City>Prishtine</City><CountryCode>XK</CountryCode></MainAddress><Name>${safe}</Name></Company></Customer></CustomerSaveRequest>`;
}

function failure(error: unknown) {
  return {
    resultCode: error instanceof Mb3mError ? error.resultCode : null,
    message: error instanceof Error ? error.message : "L’appel MB3M a échoué.",
    uid: null,
  };
}

/** Sonde temporaire : XK brut doit rendre -701, XK mappé en RS doit créer une fiche. */
export async function POST(request: Request) {
  if (!allowed(request)) return new NextResponse(null, { status: 404 });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const rawName = `TEST TRAVELBA XK BRUT ${stamp}`;
  const mappedName = `TEST TRAVELBA XK RS ${stamp}`;
  let agencies: { count: number; agence1750: boolean } | { error: string };
  try {
    const names = await mb3mAgencyNames();
    agencies = { count: names.length, agence1750: names.includes("Agence 1750") };
  } catch (error) {
    agencies = { error: error instanceof Error ? error.message : "Agences illisibles." };
  }
  let raw: { resultCode: number | null; message: string; uid: string | null };
  try {
    const xml = await mb3mSoap("CustomerService", "ICustomerService", "Save", rawCompanyXml(rawName));
    const code = Number(mb3mXmlText(xml, "ResultCode"));
    raw = {
      resultCode: Number.isFinite(code) ? code : null,
      message: mb3mOperationMessage(xml),
      uid: mb3mXmlText(xml, "Uid") || null,
    };
  } catch (error) {
    raw = failure(error);
  }
  let mapped: { resultCode: number | null; message: string; uid: string | null; partnerId: string | null; name: string };
  try {
    const saved = await mb3mSaveCompany({
      name: mappedName,
      address: {
        name: mappedName,
        line1: LINE,
        postalCode: "10000",
        city: "Prishtine",
        countryCode: "XK",
      },
    });
    mapped = { resultCode: 1, message: "ok", uid: saved.uid, partnerId: saved.partnerId, name: mappedName };
  } catch (error) {
    mapped = { ...failure(error), partnerId: null, name: mappedName };
  }
  return NextResponse.json({
    realm: mb3mRealm(),
    lineLength: LINE.length,
    agencies,
    raw,
    mapped,
  });
}
