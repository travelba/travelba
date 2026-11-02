/** Client SOAP MB3M Partners (serveur). Les identifiants restent dans l’environnement. */

import { productionOnlySecret } from "@/lib/crm/preview-secrets";

export const MB3M_ORIGIN = "https://api.mb3m.com";

export type Mb3mRealm = "test" | "production";

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
  /** M → Mr, F → Mme, sinon Unknown. */
  civility?: Mb3mCivility;
  firstName: string;
  name: string;
  email?: string;
  address: Mb3mAddress;
  /** YYYY-MM-DD. Envoyé en YYYY-MM-DDT00:00:00. */
  birthDate?: string | null;
  /** Code pays de la nationalité. */
  country?: string | null;
  /** Téléphone principal → MobileNumber. */
  mobileNumber?: string | null;
  /** Téléphone secondaire → PhoneNumber. */
  phoneNumber?: string | null;
};

export type Mb3mCompanyDraft = {
  partnerId?: string;
  name: string;
  /** Nom commercial. À défaut, la raison sociale. */
  commercialName?: string | null;
  email?: string;
  /** Téléphone du client, pas un contact distinct. */
  phoneNumber?: string | null;
  address: Mb3mAddress;
};

export function mb3mCivilityFromSex(sex: string | null | undefined): Mb3mCivility {
  const value = (sex || "").trim().toUpperCase();
  if (value === "M") return "Mr";
  if (value === "F") return "Mme";
  return "Unknown";
}

export type Mb3mTraveler = {
  firstName: string;
  name: string;
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
  /** Marge unitaire : prix vendu − coûts rattachés. Peut être négative. */
  marginUnit?: number | null;
  /**
   * Commission de la ligne. Absente ou nulle : 0,01 sur une billetterie
   * (aérien 2, ferroviaire 5, low cost 27), sinon le bloc n’est pas envoyé.
   * MB3M refuse AddPieces sans commission nette et TTC (-504, code interne -22).
   */
  commissionTotal?: number | null;
  /** Fournisseur MB3M déjà connu. Sinon le défaut d’environnement, sinon l’agence de la pièce. */
  providerId?: string | null;
  /** Nom des fournisseurs des coûts, imprimé en note. Ne crée pas de fournisseur. */
  note?: string | null;
};

type FetchImpl = typeof fetch;

/** travelba.fr parle à la base de l’agence. Le local et les previews restent sur la base partners. */
export function mb3mRealm(): Mb3mRealm {
  return process.env.VERCEL_ENV === "production" ? "production" : "test";
}

/** Les identifiants @partner ne servent pas sur travelba.fr. */
export function mb3mBlockedOnProduction() {
  return mb3mRealm() === "production";
}

function mb3mUser() {
  if (mb3mRealm() === "production") return productionOnlySecret(process.env.MB3M_PROD_API_USER);
  return (process.env.MB3M_API_USER || "").trim();
}

function mb3mPassword() {
  if (mb3mRealm() === "production") return productionOnlySecret(process.env.MB3M_PROD_API_PASSWORD);
  return (process.env.MB3M_API_PASSWORD || "").trim();
}

export function mb3mConfigured() {
  return Boolean(mb3mUser() && mb3mPassword());
}

/** Activité d’une ligne standard. Le 3 de la base partners ne vaut pas pour l’agence. */
export function mb3mActivityId() {
  const raw =
    mb3mRealm() === "production"
      ? productionOnlySecret(process.env.MB3M_PROD_ACTIVITY_ID)
      : (process.env.MB3M_ACTIVITY_ID || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** Identifiant partenaire MB3M : 14 caractères, tiré d’un UUID Travelba. */
export function mb3mPartnerCode(id: string) {
  const code = id.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 14);
  if (code.length < 8) throw new Mb3mError("Identifiant partenaire MB3M invalide.", -1);
  return code;
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

function birthStamp(value: string | null | undefined) {
  const day = (value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : "";
}

function addressXml(address: Mb3mAddress, fallbackName: string) {
  return `${tag("Name", address.name.trim() || fallbackName)}${tag("Line1", address.line1.trim())}${tag("PostalCode", address.postalCode.trim())}${tag("City", address.city.trim())}${tag("CountryCode", address.countryCode?.trim())}`;
}

/** Dernier appel parti : un refus (ResultCode ≠ 1) est journalisé avec sa requête, pour le support MB3M. */
let lastCall: { service: string; action: string; inner: string } | null = null;

/** Message MB3M pour l’écran : le texte générique, puis Details (code interne). */
export function mb3mOperationMessage(xml: string) {
  const message = (mb3mXmlText(xml, "Message") || "L’opération MB3M a échoué.").replace(/\s+/g, " ").trim();
  const details = mb3mXmlText(xml, "Details").replace(/\s+/g, " ").trim();
  if (!details || message.includes(details)) return message;
  return `${message} — ${details}`;
}

function assertOperation(xml: string) {
  const raw = mb3mXmlText(xml, "ResultCode");
  if (!raw) return;
  const code = Number(raw);
  if (code === 1) return;
  const message = mb3mOperationMessage(xml);
  const body = xml.replace(/^[\s\S]*?<s:Body>/, "").replace(/<\/s:Body>[\s\S]*$/, "").slice(0, 3000);
  console.error(
    `[mb3m] ${lastCall ? `${lastCall.service}/${lastCall.action}` : "?"} ResultCode ${raw} ${message}\nréponse : ${body}\nrequête : ${(lastCall?.inner || "").slice(0, 6000)}`
  );
  throw new Mb3mError(message, Number.isFinite(code) ? code : -1);
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
      mb3mRealm() === "production"
        ? "L’accès MB3M de production n’est pas configuré."
        : "L’accès MB3M n’est pas configuré.",
      0
    );
  }
  lastCall = { service, action, inner };
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
    // Le détail de la faute (type d’exception, pile .NET) ne passe pas à l’écran : il va dans les logs.
    const detail = mb3mFaultDetail(xml);
    console.error(`[mb3m] ${service}/${action} ${response.status} ${fault || "sans faultstring"}${detail ? `\n${detail}` : ""}`);
    throw new Mb3mError(fault || "L’API MB3M n’a pas répondu.", response.ok ? -1 : response.status);
  }
  return xml;
}

/** Type d’exception et premières lignes de pile d’une faute SOAP, sans le corps de la requête. */
export function mb3mFaultDetail(xml: string) {
  const type = mb3mXmlText(xml, "Type");
  const message = mb3mXmlText(xml, "Message");
  const stack = mb3mXmlText(xml, "StackTrace")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join("\n");
  return [type, message, stack].filter(Boolean).join("\n").slice(0, 2000);
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

/**
 * Agence à poser sur le dossier et la pièce. Une seule agence sur la base : son Uid.
 * Plusieurs (base partners) : rien, le serveur prend celle du compte.
 * Sans agence sur la pièce, la base de l’agence répond « Nullable object must have a value ».
 */
export async function mb3mSingleAgencyUid(fetchImpl?: FetchImpl) {
  const xml = await mb3mSoap(
    "ConfigurationService",
    "IConfigurationService",
    "GetAgencies",
    `<GetAgencies xmlns="http://schemas.mb3m.fr/Partners"/>`,
    fetchImpl
  );
  const blocks = xml.match(/<Agency>[\s\S]*?<\/Agency>/g) || [];
  if (blocks.length !== 1) return null;
  return mb3mXmlText(blocks[0], "Uid") || null;
}

function agencyXml(uid: string | null | undefined) {
  const value = (uid || "").trim();
  return value ? `<Agency><Uid>${escapeMb3mXml(value)}</Uid></Agency>` : "";
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
  // Pas de XSD dans le dépôt (WSDL Partners en 401). L’ordre déjà accepté est Id puis Person.
  // Person : BirthDate, Civility, Country, Email, FirstName, MainAddress, MobileNumber, Name, PhoneNumber.
  const person = `<Person>${tag("BirthDate", birthStamp(draft.birthDate))}${tag("Civility", draft.civility)}${tag("Country", draft.country?.trim())}${tag("Email", draft.email?.trim())}${tag("FirstName", firstName)}<MainAddress>${addressXml(draft.address, name)}</MainAddress>${tag("MobileNumber", draft.mobileNumber?.trim())}${tag("Name", name)}${tag("PhoneNumber", draft.phoneNumber?.trim())}</Person>`;
  const inner = `<CustomerSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Customer>${tag("Id", draft.partnerId?.trim())}${person}</Customer></CustomerSaveRequest>`;
  const xml = await mb3mSoap("CustomerService", "ICustomerService", "Save", inner, fetchImpl);
  assertOperation(xml);
  const uid = mb3mXmlText(xml, "Uid");
  if (!uid) throw new Mb3mError("MB3M n’a pas renvoyé de fiche.", -1);
  return { uid, partnerId: mb3mXmlText(xml, "Id") };
}

export async function mb3mSaveCompany(draft: Mb3mCompanyDraft, fetchImpl?: FetchImpl) {
  const name = draft.name.trim();
  if (!name) throw new Mb3mError("La raison sociale est requise.", -1);
  const commercial = (draft.commercialName || name).trim() || name;
  // Company : CommercialName, Email, MainAddress, Name, PhoneNumber, puis Id du client.
  // SIRET, TVA et lien du contact : absents du schéma Partners.
  const company = `<Company>${tag("CommercialName", commercial)}${tag("Email", draft.email?.trim())}<MainAddress>${addressXml(draft.address, name)}</MainAddress>${tag("Name", name)}${tag("PhoneNumber", draft.phoneNumber?.trim())}</Company>`;
  const inner = `<CustomerSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Customer>${company}${tag("Id", draft.partnerId?.trim())}</Customer></CustomerSaveRequest>`;
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
    destination?: string;
    destinationIso?: string;
    codeRef?: string;
    id?: string;
    agencyUid?: string | null;
  },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Folder>${agencyXml(input.agencyUid)}${tag("CodeRef", input.codeRef?.trim())}<CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("DateEnd", `${dayStamp(input.dateEnd)}T00:00:00`)}${tag("DateStart", `${dayStamp(input.dateStart)}T00:00:00`)}${tag("Destination", input.destination?.trim())}${tag("DestinationIso", input.destinationIso?.trim())}${tag("FolderType", input.folderType)}${tag("Id", input.id?.trim())}${tag("Title", input.title.trim())}</Folder></FolderSaveRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "Save", inner, fetchImpl);
  assertOperation(xml);
  const id = mb3mXmlTexts(xml, "Id")[0] || "";
  const known = new Set([input.customerUid.trim(), (input.agencyUid || "").trim()].filter(Boolean));
  const uid = mb3mXmlTexts(xml, "Uid").find((value) => !known.has(value)) || "";
  if (!id) throw new Mb3mError("MB3M n’a pas renvoyé de dossier.", -1);
  return { id, uid };
}

/** Vol, train et low cost du fichier MB3M. On les facture en Divers terrestre. */
const MB3M_TICKETING_FILE_IDS = new Set([2, 5, 27]);
const MB3M_STANDARD_ACTIVITY = 22;

/** 2, 5 et 27 deviennent 22. Les autres activités restent. */
export function mb3mPrestationActivityId(activityId: number | null | undefined) {
  if (activityId == null) return undefined;
  return MB3M_TICKETING_FILE_IDS.has(activityId) ? MB3M_STANDARD_ACTIVITY : activityId;
}

const MB3M_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mb3mGuid(value: string | null | undefined) {
  const text = (value || "").trim();
  return MB3M_GUID.test(text) ? text : "";
}

/** Fournisseur par défaut. Production : `MB3M_PROD_PROVIDER_ID`. Ailleurs : `MB3M_PROVIDER_ID`. */
export function mb3mDefaultProviderId() {
  const raw =
    mb3mRealm() === "production"
      ? productionOnlySecret(process.env.MB3M_PROD_PROVIDER_ID)
      : (process.env.MB3M_PROVIDER_ID || "").trim();
  return mb3mGuid(raw);
}

function commissionXml(line: Mb3mLine) {
  const given = line.commissionTotal;
  if (given == null || !Number.isFinite(given) || given === 0) return "";
  const amount = money(given);
  // Ordre WCF : CommissionNetTotal, CommissionTaxRate, CommissionTotal.
  return `${tag("CommissionNetTotal", amount)}${tag("CommissionTaxRate", 0)}${tag("CommissionTotal", amount)}`;
}

function providerXml(line: Mb3mLine, fallback?: string | null) {
  const id = mb3mGuid(line.providerId) || mb3mDefaultProviderId() || mb3mGuid(fallback);
  return tag("ProviderId", id);
}

export function linesXml(kind: "InvoiceLine" | "CreditNoteLine", lines: Mb3mLine[], providerFallback?: string | null) {
  if (!lines.length) throw new Mb3mError("La pièce MB3M n’a pas de ligne.", -1);
  return lines
    .map((line) => {
      const type = line.type || "Standard";
      if (line.activityId != null && (!Number.isInteger(line.activityId) || line.activityId <= 0)) {
        throw new Mb3mError("Activité MB3M invalide.", -1);
      }
      const activityId = mb3mPrestationActivityId(line.activityId);
      const activity = activityId == null ? "" : tag("ActivityId", activityId);
      const margin =
        line.marginUnit == null || !Number.isFinite(line.marginUnit) ? "" : tag("MarginUnit", money(line.marginUnit));
      const note = tag("Note", (line.note || "").trim().slice(0, 250));
      // Ordre WCF InvoiceLine / CreditNoteLine : ActivityId, CommissionNetTotal, CommissionTaxRate,
      // CommissionTotal, CustomType, Label, MarginTaxRate, MarginTaxTotal, MarginUnit, NetPriceTotal,
      // NetPriceUnit, Note, ProviderId, Quantity, RefPiece, TaxRate, TaxTotal, Type.
      return `<${kind}>${activity}${commissionXml(line)}${tag("Label", line.label.trim())}${margin}${tag("NetPriceTotal", money(line.netPriceTotal))}${tag("NetPriceUnit", money(line.netPriceUnit))}${note}${providerXml(line, providerFallback)}${tag("Quantity", quantity(line.quantity))}${tag("Type", type)}</${kind}>`;
    })
    .join("");
}

function pieceIdentity(xml: string, kind: "Invoice" | "CreditNote") {
  const blocks = [...xml.matchAll(new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`, "g"))].map((match) => match[1]);
  const scope = blocks.at(-1) || xml;
  const number = mb3mXmlTexts(scope, "Number").filter(Boolean).at(-1) || "";
  if (!number) throw new Mb3mError("MB3M n’a pas renvoyé de numéro de pièce.", -1);
  const head = scope.split("<CustomerIdentity>")[0] || "";
  return { number, uid: mb3mXmlText(head, "Uid") };
}

function pieceNumber(xml: string, kind: "Invoice" | "CreditNote") {
  return pieceIdentity(xml, kind).number;
}

function travelersXml(travelers: Mb3mTraveler[] | undefined) {
  const rows = (travelers || [])
    .map((traveler) => ({ firstName: traveler.firstName.trim(), name: traveler.name.trim() }))
    .filter((traveler) => traveler.firstName && traveler.name);
  if (!rows.length) return "";
  const inner = rows
    .map(
      (traveler) =>
        `<Traveler><Traveler><Person>${tag("FirstName", traveler.firstName)}${tag("Name", traveler.name)}</Person></Traveler></Traveler>`
    )
    .join("");
  return `<Travelers>${inner}</Travelers>`;
}

/** Compte bancaire MB3M d’un crédit CRM. Le mode reste un virement, sauf une carte Stripe. */
export function mb3mPaymentAccount(source: string | null | undefined, label: string | null | undefined) {
  const text = `${source || ""} ${label || ""}`.toLowerCase();
  if (source === "revolut" || text.includes("revolut")) return { mode: "Virement", bank: "REVOLUT" };
  if (source === "stripe" || text.includes("stripe")) return { mode: "Carte", bank: "STRIPE" };
  if (text.includes("qonto")) return { mode: "Virement", bank: "QONTO" };
  return { mode: "Virement", bank: "VIREMENT" };
}

export function mb3mPaymentReference(transactionId: string) {
  return `CRM ${transactionId.trim()}`;
}

/**
 * Encaissement client. Ordre alphabétique, comme les champs du dossier :
 * Amount, BankAccount, Date, FolderId, Mode, Reference.
 */
export async function mb3mSavePayment(
  input: {
    folderId: string;
    amount: number;
    date: string;
    reference: string;
    bank: string;
    mode: string;
  },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderSavePaymentRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Payment>${tag("Amount", money(input.amount))}${tag("BankAccount", input.bank.trim())}${tag("Date", `${dayStamp(input.date)}T00:00:00`)}${tag("FolderId", input.folderId.trim())}${tag("Mode", input.mode.trim())}${tag("Reference", input.reference.trim())}</Payment></FolderSavePaymentRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "SavePayment", inner, fetchImpl);
  assertOperation(xml);
  const number = mb3mXmlText(xml, "Number");
  if (!number) throw new Mb3mError("MB3M n’a pas renvoyé de numéro de règlement.", -1);
  return { number };
}

/** Lettrage du règlement sur la facture, pour le montant qui reste dû. */
export async function mb3mWriteMatching(
  input: { paymentNumber: string; invoiceNumber: string; amount: number },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderWriteMatchingRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Matching>${tag("Amount", money(input.amount))}${tag("PaymentNumber", input.paymentNumber.trim())}${tag("PieceNumber", input.invoiceNumber.trim())}</Matching></FolderWriteMatchingRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "WriteMatching", inner, fetchImpl);
  assertOperation(xml);
  return { id: mb3mXmlText(xml, "Id") || mb3mXmlText(xml, "Number") };
}

export type Mb3mRemotePayment = {
  number: string;
  reference: string;
  amount: number;
  date: string;
  invoiceNumber: string | null;
};

/** Règlements déjà saisis chez MB3M pour ce client, pour ne pas les recréer. */
export async function mb3mFindCustomerPayments(customerUid: string, fetchImpl?: FetchImpl): Promise<Mb3mRemotePayment[]> {
  const inner = `<FolderFindPaymentsRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><CustomerIdentity><Uid>${escapeMb3mXml(customerUid.trim())}</Uid></CustomerIdentity></FolderFindPaymentsRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "FindPayments", inner, fetchImpl);
  assertOperation(xml);
  const blocks = xml.match(/<Payment>[\s\S]*?<\/Payment>/g) || [];
  return blocks.flatMap((block) => {
    const number = mb3mXmlText(block, "Number");
    const amount = Number(mb3mXmlText(block, "Amount"));
    const date = mb3mXmlText(block, "Date").slice(0, 10);
    if (!number || !Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [
      {
        number,
        reference: mb3mXmlText(block, "Reference"),
        amount,
        date,
        invoiceNumber: mb3mXmlText(block, "PieceNumber") || null,
      },
    ];
  });
}

export async function mb3mAddInvoice(
  input: {
    folderId: string;
    customerUid: string;
    title: string;
    lines: Mb3mLine[];
    dateStart?: string;
    dateEnd?: string;
    destination?: string;
    destinationIso?: string;
    refCommand?: string;
    travelers?: Mb3mTraveler[];
    agencyUid?: string | null;
  },
  fetchImpl?: FetchImpl
) {
  const inner = `<FolderAddPiecesRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><FolderId>${escapeMb3mXml(input.folderId.trim())}</FolderId><Invoice>${agencyXml(input.agencyUid)}<CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("Title", input.title.trim())}${tag("RefCommand", input.refCommand?.trim())}${tag("DateEnd", input.dateEnd ? dayStamp(input.dateEnd) : "")}${tag("DateStart", input.dateStart ? dayStamp(input.dateStart) : "")}${tag("Destination", input.destination?.trim())}${tag("DestinationIso", input.destinationIso?.trim())}<Lines>${linesXml("InvoiceLine", input.lines, input.agencyUid)}</Lines>${travelersXml(input.travelers)}</Invoice></FolderAddPiecesRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "AddPieces", inner, fetchImpl);
  assertOperation(xml);
  return pieceIdentity(xml, "Invoice");
}

/** PDF d’une pièce. ResultCode 0 avec un fichier est un succès : l’exemple officiel renvoie 0. */
export function mb3mPdfBytes(xml: string) {
  const payload = mb3mXmlText(xml, "Payload").replace(/\s+/g, "");
  if (!payload) {
    const raw = mb3mXmlText(xml, "ResultCode");
    const code = Number(raw);
    const spoken = mb3mXmlText(xml, "Message") || mb3mXmlText(xml, "Details");
    throw new Mb3mError(spoken ? mb3mOperationMessage(xml) : "MB3M n’a pas renvoyé le PDF.", Number.isFinite(code) ? code : -1);
  }
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length < 5 || bytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Mb3mError("Le fichier MB3M n’est pas un PDF.", -1);
  }
  return {
    bytes,
    contentType: mb3mXmlText(xml, "ContentType") || "application/pdf",
    fileName: mb3mXmlText(xml, "SuggestedFilename"),
  };
}

export async function mb3mRenderPiece(input: { number: string }, fetchImpl?: FetchImpl) {
  const number = input.number.trim();
  if (!/^[1-9]\d*$/.test(number)) throw new Mb3mError("Numéro de facture MB3M invalide.", -1);
  const inner = `<RenderPieceRequest xmlns="http://schemas.mb3m.fr/Partners"><Format>Pdf</Format><Id><Number>${number}</Number></Id></RenderPieceRequest>`;
  const xml = await mb3mSoap("RenderService", "IRenderService", "Piece", inner, fetchImpl);
  return mb3mPdfBytes(xml);
}

/** Une pièce filtrée par numéro. DatePrint ou PrintedDate veut dire qu’elle est émise. */
export function mb3mPieceState(xml: string): "printed" | "open" | "missing" {
  if (mb3mXmlText(xml, "TotalCount") === "0") return "missing";
  if (/<(?:DatePrint|PrintedDate)(?:\s[^>]*)?>\s*[^<\s][^<]*</.test(xml)) return "printed";
  if (mb3mXmlText(xml, "Number")) return "open";
  return "missing";
}

export async function mb3mFindPiece(number: string, fetchImpl?: FetchImpl) {
  const pieceNumber = number.trim();
  if (!/^[1-9]\d*$/.test(pieceNumber)) throw new Mb3mError("Numéro de facture MB3M invalide.", -1);
  const inner = `<FolderFindPiecesQuery xmlns="http://schemas.mb3m.fr/Partners"><IncludeInvoices>true</IncludeInvoices><Number>${pieceNumber}</Number><PageIndex>0</PageIndex><PageSize>5</PageSize></FolderFindPiecesQuery>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "FindAllPieces", inner, fetchImpl);
  const fault = mb3mXmlText(xml, "faultstring");
  if (fault) throw new Mb3mError(fault, -1);
  return mb3mPieceState(xml);
}

export async function mb3mCancelInvoice(folderId: string, number: string, fetchImpl?: FetchImpl) {
  const pieceNumber = number.trim();
  if (!/^[1-9]\d*$/.test(pieceNumber)) throw new Mb3mError("Numéro de facture MB3M invalide.", -1);
  const inner = `<FolderCancelPieceRequest xmlns="http://schemas.mb3m.fr/Partners"><FolderId>${escapeMb3mXml(folderId.trim())}</FolderId><Number>${pieceNumber}</Number></FolderCancelPieceRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "CancelInvoice", inner, fetchImpl);
  assertOperation(xml);
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
    agencyUid?: string | null;
  },
  fetchImpl?: FetchImpl
) {
  const agency = agencyXml(input.agencyUid);
  const inner = `<FolderSaveRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Folder>${agency}<CreditNotes><CreditNote>${agency}<CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("Title", input.title.trim())}${tag("RefCommand", input.refCommand?.trim())}${tag("DateEnd", dayStamp(input.dateEnd))}${tag("DateStart", dayStamp(input.dateStart))}${tag("DestinationIso", input.destinationIso?.trim())}<Lines>${linesXml("CreditNoteLine", input.lines, input.agencyUid)}</Lines></CreditNote></CreditNotes><CustomerIdentity><Uid>${escapeMb3mXml(input.customerUid.trim())}</Uid></CustomerIdentity>${tag("DateEnd", `${dayStamp(input.dateEnd)}T00:00:00`)}${tag("DateStart", `${dayStamp(input.dateStart)}T00:00:00`)}${tag("FolderType", input.folderType)}${tag("Id", input.folderId.trim())}${tag("Title", input.folderTitle.trim())}</Folder></FolderSaveRequest>`;
  const xml = await mb3mSoap("FolderService", "IFolderService", "Save", inner, fetchImpl);
  assertOperation(xml);
  return { number: pieceNumber(xml, "CreditNote") };
}
