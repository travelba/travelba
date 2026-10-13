/** Client SOAP MB3M Partners (serveur). Les identifiants restent dans l’environnement. */

export const MB3M_ORIGIN = "https://api.mb3m.com";

export class Mb3mError extends Error {
  constructor(
    message: string,
    readonly resultCode: number
  ) {
    super(message);
    this.name = "Mb3mError";
  }
}

export type Mb3mCivility = "Unknown" | "Mme" | "Mlle" | "Mr";
export type Mb3mFolderType = "Prestation" | "Production" | "ProductionGIR";
export type Mb3mLineType = "Standard" | "Note";

export type Mb3mAddress = {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
  countryCode?: string;
};

export type Mb3mPersonDraft = {
  partnerId?: string;
  civility?: Mb3mCivility;
  firstName: string;
  name: string;
  email?: string;
  address: Mb3mAddress;
};

export type Mb3mCustomerHit = {
  uid: string;
  name: string;
  altName: string;
  company: boolean;
};

export type Mb3mLine = {
  label: string;
  quantity: number;
  netPriceUnit: number;
  netPriceTotal: number;
  activityId?: number;
  type?: Mb3mLineType;
};

type FetchImpl = typeof fetch;

/** Base partners partagée : ces identifiants ne doivent pas servir sur travelba.fr. */
export function mb3mBlockedOnProduction() {
  return process.env.VERCEL_ENV === "production";
}

function mb3mUser() {
  if (mb3mBlockedOnProduction()) return "";
  return (process.env.MB3M_API_USER || "").trim();
}

function mb3mPassword() {
  if (mb3mBlockedOnProduction()) return "";
  return (process.env.MB3M_API_PASSWORD || "").trim();
}

export function mb3mConfigured() {
  return Boolean(mb3mUser() && mb3mPassword());
}

export function escapeMb3mXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeMb3mXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#xD;", "\n")
    .replaceAll("&amp;", "&");
}

export function mb3mXmlText(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
  return match ? decodeMb3mXml(match[1]).trim() : "";
}

export function mb3mXmlTexts(xml: string, name: string) {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, "g"))].map((match) =>
    decodeMb3mXml(match[1]).trim()
  );
}

function tag(name: string, value: string | number | undefined | null) {
  if (value === undefined || value === null || value === "") return "";
  return `<${name}>${escapeMb3mXml(String(value))}</${name}>`;
}

function money(value: number) {
  if (!Number.isFinite(value)) throw new Mb3mError("Montant MB3M invalide.", -1);
  return String(value);
}

function quantity(value: number) {
  if (!Number.isInteger(value) || value < 1) throw new Mb3mError("Quantité MB3M invalide.", -1);
  return String(value);
}

function dayStamp(value: string) {
  const day = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Mb3mError("Date MB3M invalide.", -1);
  return day;
}

function assertOperation(xml: string) {
  const raw = mb3mXmlText(xml, "ResultCode");
  if (!raw) return;
  const code = Number(raw);
  if (code === 1) return;
  throw new Mb3mError(mb3mXmlText(xml, "Message") || "L’opération MB3M a échoué.", Number.isFinite(code) ? code : -1);
}

export async function mb3mSoap(
  service: string,
  contract: string,
  action: string,
  inner: string,
  fetchImpl: FetchImpl = fetch
) {
  const user = mb3mUser();
  const password = mb3mPassword();
  if (!user || !password) {
    throw new Mb3mError(
      mb3mBlockedOnProduction()
        ? "Les identifiants de test MB3M ne sont pas utilisés en production."
        : "L’accès MB3M n’est pas configuré.",
      0
    );
  }
  const response = await fetchImpl(`${MB3M_ORIGIN}/Partners/1.0/${service}.svc/Soap`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"http://schemas.mb3m.fr/Partners/${contract}/${action}"`,
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
    },
    body: `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${inner}</s:Body></s:Envelope>`,
  });
  const xml = await response.text();
  const fault = mb3mXmlText(xml, "faultstring");
  if (!response.ok || fault) {
    throw new Mb3mError(fault || "L’API MB3M n’a pas répondu.", response.ok ? -1 : response.status);
  }
  return xml;
}

export async function mb3mAgencyNames(fetchImpl?: FetchImpl) {
  const xml = await mb3mSoap(
    "ConfigurationService",
    "IConfigurationService",
    "GetAgencies",
    `<GetAgencies xmlns="http://schemas.mb3m.fr/Partners"/>`,
    fetchImpl
  );
  return mb3mXmlTexts(xml, "DisplayName").filter(Boolean);
}

export async function mb3mFindPersons(
  query: { email?: string; name?: string; firstName?: string },
  fetchImpl?: FetchImpl
) {
  const inner = `<CustomerFindRequest xmlns="http://schemas.mb3m.fr/Partners">${tag("AltName", query.firstName)}${tag("Email", query.email)}<IncludeCompanies>false</IncludeCompanies><IncludePersons>true</IncludePersons>${tag("Name", query.name)}<PageIndex>0</PageIndex><PageSize>10</PageSize></CustomerFindRequest>`;
  const xml = await mb3mSoap("CustomerService", "ICustomerService", "FindAll", inner, fetchImpl);
  const blocks = xml.match(/<CustomerSummary>[\s\S]*?<\/CustomerSummary>/g) || [];
  const customers: Mb3mCustomerHit[] = [];
  for (const block of blocks) {
    const uid = mb3mXmlText(block, "Uid");
    if (!uid) continue;
    customers.push({
      uid,
      name: mb3mXmlText(block, "Name"),
      altName: mb3mXmlText(block, "AltName"),
      company: mb3mXmlText(block, "IsCompany") === "true",
    });
  }
  const total = Number(mb3mXmlText(xml, "TotalCount"));
  return { customers, total: Number.isFinite(total) ? total : customers.length };
}

export async function mb3mSavePerson(draft: Mb3mPersonDraft, fetchImpl?: FetchImpl) {
  const firstName = draft.firstName.trim();
  const name = draft.name.trim();
  if (!firstName || !name) throw new Mb3mError("Le nom et le prénom sont requis.", -1);
  const address = draft.address;
  const inner = `<CustomerSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Customer>${tag("Id", draft.partnerId?.trim())}<Person>${tag("Civility", draft.civility)}${tag("Email", draft.email?.trim())}${tag("FirstName", firstName)}<MainAddress>${tag("Name", address.name.trim())}${tag("Line1", address.line1.trim())}${tag("PostalCode", address.postalCode.trim())}${tag("City", address.city.trim())}${tag("CountryCode", address.countryCode?.trim())}</MainAddress>${tag("Name", name)}</Person></Customer></CustomerSaveRequest>`;
  const xml = await mb3mSoap("CustomerService", "ICustomerService", "Save", inner, fetchImpl);
  assertOperation(xml);
  const uid = mb3mXmlText(xml, "Uid");
  if (!uid) throw new Mb3mError("MB3M n’a pas renvoyé de fiche.", -1);
  return { uid, partnerId: mb3mXmlText(xml, "Id") };
}

export async function mb3mSaveFolder(
  input: {
    customerUid: string;
    title: string;
    folderType: Mb3mFolderType;
    dateStart: string;
    dateEnd: string;
    destinationIso?: string;
    codeRef?: string;
    id?: string;
  },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Folder>${tag("CodeRef", input.codeRef?.trim())}<CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("DateEnd", `${dayStamp(input.dateEnd)}T00:00:00`)}${tag("DateStart", `${dayStamp(input.dateStart)}T00:00:00`)}${tag("DestinationIso", input.destinationIso?.trim())}${tag("FolderType", input.folderType)}${tag("Id", input.id?.trim())}${tag("Title", input.title.trim())}</Folder></FolderSaveRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "Save", inner, fetchImpl);
  assertOperation(xml);
  const id = mb3mXmlTexts(xml, "Id")[0] || "";
  const uid = mb3mXmlTexts(xml, "Uid").find((value) => value !== input.customerUid.trim()) || "";
  if (!id) throw new Mb3mError("MB3M n’a pas renvoyé de dossier.", -1);
  return { id, uid };
}

function linesXml(kind: "InvoiceLine" | "CreditNoteLine", lines: Mb3mLine[]) {
  if (!lines.length) throw new Mb3mError("La pièce MB3M n’a pas de ligne.", -1);
  return lines
    .map((line) => {
      const type = line.type || "Standard";
      if (line.activityId != null && (!Number.isInteger(line.activityId) || line.activityId <= 0)) {
        throw new Mb3mError("Activité MB3M invalide.", -1);
      }
      const activity = line.activityId == null ? "" : tag("ActivityId", line.activityId);
      return `<${kind}>${activity}${tag("Label", line.label.trim())}${tag("NetPriceTotal", money(line.netPriceTotal))}${tag("NetPriceUnit", money(line.netPriceUnit))}${tag("Quantity", quantity(line.quantity))}${tag("Type", type)}</${kind}>`;
    })
    .join("");
}

function pieceNumber(xml: string, kind: "Invoice" | "CreditNote") {
  const blocks = [...xml.matchAll(new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`, "g"))].map((match) => match[1]);
  const scope = blocks.at(-1) || xml;
  const number = mb3mXmlTexts(scope, "Number").filter(Boolean).at(-1) || "";
  if (!number) throw new Mb3mError("MB3M n’a pas renvoyé de numéro de pièce.", -1);
  return number;
}

export async function mb3mAddInvoice(
  input: {
    folderId: string;
    customerUid: string;
    title: string;
    lines: Mb3mLine[];
    dateStart?: string;
    dateEnd?: string;
    destinationIso?: string;
    refCommand?: string;
  },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderAddPiecesRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><FolderId>${escapeMb3mXml(input.folderId.trim())}</FolderId><Invoice><CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("Title", input.title.trim())}${tag("RefCommand", input.refCommand?.trim())}${tag("DateEnd", input.dateEnd ? dayStamp(input.dateEnd) : "")}${tag("DateStart", input.dateStart ? dayStamp(input.dateStart) : "")}${tag("DestinationIso", input.destinationIso?.trim())}<Lines>${linesXml("InvoiceLine", input.lines)}</Lines></Invoice></FolderAddPiecesRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "AddPieces", inner, fetchImpl);
  assertOperation(xml);
  return { number: pieceNumber(xml, "Invoice") };
}

export async function mb3mAddCreditNote(
  input: {
    folderId: string;
    customerUid: string;
    folderTitle: string;
    folderType: Mb3mFolderType;
    dateStart: string;
    dateEnd: string;
    title: string;
    lines: Mb3mLine[];
    destinationIso?: string;
    refCommand?: string;
  },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Folder><CreditNotes><CreditNote><CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("Title", input.title.trim())}${tag("RefCommand", input.refCommand?.trim())}${tag("DateEnd", dayStamp(input.dateEnd))}${tag("DateStart", dayStamp(input.dateStart))}${tag("DestinationIso", input.destinationIso?.trim())}<Lines>${linesXml("CreditNoteLine", input.lines)}</Lines></CreditNote></CreditNotes><CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("DateEnd", `${dayStamp(input.dateEnd)}T00:00:00`)}${tag("DateStart", `${dayStamp(input.dateStart)}T00:00:00`)}${tag("FolderType", input.folderType)}${tag("Id", input.folderId.trim())}${tag("Title", input.folderTitle.trim())}</Folder></FolderSaveRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "Save", inner, fetchImpl);
  assertOperation(xml);
  return { number: pieceNumber(xml, "CreditNote") };
}
