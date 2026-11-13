/** Client SOAP MB3M Partners (serveur). Les identifiants restent dans l’environnement. */

import { resolveCountryCode } from "@/lib/crm/countries";
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
export type Mb3mLineType = "Standard" | "Note" | "Custom";

export type Mb3mAddress = {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
  countryCode?: string;
};

/**
 * Adresse MB3M. Une société hors France peut n’avoir ni code postal :
 * le champ est alors omis. Une personne, ou une société française, le garde.
 */
export function mb3mAddress(input: {
  name: string;
  line?: string | null;
  postal?: string | null;
  city?: string | null;
  country?: string | null;
  company?: boolean;
}): Mb3mAddress | null {
  const line1 = (input.line || "").trim();
  const postalCode = (input.postal || "").trim();
  const cityName = (input.city || "").trim();
  const countryCode = resolveCountryCode(input.country) || undefined;
  const postalOptional = Boolean(input.company && countryCode && countryCode !== "FR");
  if (!line1 || !cityName) return null;
  if (!postalOptional && !postalCode) return null;
  return {
    name: input.name,
    line1,
    postalCode,
    city: cityName,
    ...(countryCode ? { countryCode } : {}),
  };
}

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
  /** Marge unitaire : prix vendu − coûts rattachés. Peut être négative. Absente sur un frais d’agence. */
  marginUnit?: number | null;
  /**
   * CommissionId MB3M, seulement quand la billetterie est ouverte (`MB3M_FLIGHT_COMMISSION=1`).
   * Jamais les champs CommissionNetTotal / CommissionTotal : la marge seule est envoyée.
   */
  commissionId?: number | null;
  /** Frais d’agence : Type Custom, LineType 4, code 401, 12, 13 ou 4. */
  customType?: { complementary: string; lineType: 4 } | null;
  /** Fournisseur déjà dans le catalogue. L’agence pour un frais. Jamais un fournisseur créé. */
  providerId?: string | null;
  providerRole?: "agency" | "supplier" | null;
  /** Hôtel ou transfert : n° de réservation. Vol : billet à 10 chiffres. */
  refPiece?: string | null;
  /** Vol : PNR, recopié sur la pièce s’il n’y en a qu’un. */
  refCommand?: string | null;
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

/** Retire les préfixes de namespace (`a:Invoice` → `Invoice`) avant les lectures. */
export function mb3mLocalNames(xml: string) {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, "<$1");
}

export function mb3mXmlText(xml: string, name: string) {
  const match = mb3mLocalNames(xml).match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
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
  const own = mb3mEntityUid(xml);
  const uid = (own && !known.has(own) ? own : "") || mb3mXmlTexts(withoutNestedIdentities(xml), "Uid").find((value) => !known.has(value)) || "";
  if (!id) throw new Mb3mError("MB3M n’a pas renvoyé de dossier.", -1);
  return { id, uid };
}

/**
 * Activité envoyée telle quelle. 2 = aérien, 1001 = achat direct, 27 = low cost, 5 = train.
 * Les frais généraux (14) ne sont pas une ligne de facture.
 */
export function mb3mPrestationActivityId(activityId: number | null | undefined) {
  if (activityId == null) return undefined;
  if (activityId === 14) throw new Mb3mError("Les frais généraux ne sont pas une ligne de facture.", -1);
  return activityId;
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

function commissionIdXml(line: Mb3mLine) {
  const id = line.commissionId;
  if (id == null || !Number.isInteger(id) || id <= 0) return "";
  return tag("CommissionId", id);
}

function customTypeXml(line: Mb3mLine) {
  const custom = line.customType;
  if (!custom || custom.lineType !== 4 || !custom.complementary.trim()) return "";
  return `<CustomType>${tag("Complementary", custom.complementary.trim())}${tag("LineType", 4)}</CustomType>`;
}

function providerXml(line: Mb3mLine, fallback?: string | null) {
  if (line.providerRole === "agency") return tag("ProviderId", mb3mGuid(fallback) || mb3mGuid(line.providerId));
  return tag("ProviderId", mb3mGuid(line.providerId));
}

export function linesXml(kind: "InvoiceLine" | "CreditNoteLine", lines: Mb3mLine[], providerFallback?: string | null) {
  if (!lines.length) throw new Mb3mError("La pièce MB3M n’a pas de ligne.", -1);
  return lines
    .map((line) => {
      const type = line.type || "Standard";
      if (line.activityId != null && (!Number.isInteger(line.activityId) || line.activityId <= 0)) {
        throw new Mb3mError("Activité MB3M invalide.", -1);
      }
      const activityId = line.type === "Custom" ? undefined : mb3mPrestationActivityId(line.activityId);
      const activity = activityId == null ? "" : tag("ActivityId", activityId);
      const margin =
        line.type === "Custom" || line.marginUnit == null || !Number.isFinite(line.marginUnit)
          ? ""
          : tag("MarginUnit", money(line.marginUnit));
      const note = line.type === "Custom" ? "" : tag("Note", (line.note || "").trim().slice(0, 250));
      const refPiece = tag("RefPiece", (line.refPiece || "").trim().slice(0, 40));
      // Ordre WCF : ActivityId, CommissionId, CustomType, Label, MarginUnit, NetPriceTotal,
      // NetPriceUnit, Note, ProviderId, Quantity, RefPiece, Type.
      // Pas de CommissionNetTotal ni de CommissionTotal : la marge seule.
      return `<${kind}>${activity}${commissionIdXml(line)}${customTypeXml(line)}${tag("Label", line.label.trim())}${margin}${tag("NetPriceTotal", money(line.netPriceTotal))}${tag("NetPriceUnit", money(line.netPriceUnit))}${note}${providerXml(line, providerFallback)}${tag("Quantity", quantity(line.quantity))}${refPiece}${tag("Type", type)}</${kind}>`;
    })
    .join("");
}

function pieceIdentity(xml: string, kind: "Invoice" | "CreditNote") {
  const blocks = [...xml.matchAll(new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`, "g"))].map((match) => match[1]);
  const scope = blocks.at(-1) || xml;
  const number = mb3mXmlTexts(scope, "Number").filter(Boolean).at(-1) || "";
  if (!number) throw new Mb3mError("MB3M n’a pas renvoyé de numéro de pièce.", -1);
  return { number, uid: mb3mEntityUid(scope) || "" };
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

/**
 * PaymentMode du WSDL Partners (FolderService singleWsdl).
 * None, BankTransfer, BankOrder, OnlinePaymentCard, PaymentCard, Check, Cash, Custom.
 * Custom vaut 99. Il exige CustomModeId.
 */
export const MB3M_PAYMENT_MODES = [
  "None",
  "BankTransfer",
  "BankOrder",
  "OnlinePaymentCard",
  "PaymentCard",
  "Check",
  "Cash",
  "Custom",
] as const;

export type Mb3mPaymentMode = (typeof MB3M_PAYMENT_MODES)[number];

export type Mb3mPaymentAccount = {
  mode: Mb3mPaymentMode;
  bank: string;
  customModeId: number | null;
  warning: string | null;
};

const PAYMENT_MODE_UNKNOWN = "Mode de règlement non reconnu. MB3M reçoit None.";

function paymentText(source: string | null | undefined, label: string | null | undefined) {
  return `${source || ""} ${label || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isPliantVirtualCard(text: string) {
  return text.includes("carte virtuelle pliant");
}

/**
 * Mode CRM → PaymentMode du schéma.
 * Carte virtuelle Pliant : Custom si un CustomModeId est déjà configuré, sinon PaymentCard.
 */
export function mb3mPaymentMode(
  source: string | null | undefined,
  label: string | null | undefined,
  pliantCustomModeId?: number | null
): Mb3mPaymentMode {
  return mb3mPaymentAccount(source, label, pliantCustomModeId).mode;
}

/** Compte bancaire MB3M d’un crédit CRM, et le PaymentMode du schéma. */
export function mb3mPaymentAccount(
  source: string | null | undefined,
  label: string | null | undefined,
  pliantCustomModeId?: number | null
): Mb3mPaymentAccount {
  const text = paymentText(source, label);
  const raw = `${source || ""} ${label || ""}`.toLowerCase();
  const bank = source === "revolut" || raw.includes("revolut")
    ? "REVOLUT"
    : source === "stripe" || raw.includes("stripe")
      ? "STRIPE"
      : source === "pliant" || raw.includes("pliant")
        ? "PLIANT"
        : raw.includes("qonto")
          ? "QONTO"
          : "VIREMENT";
  const customId = Number.isInteger(pliantCustomModeId) && (pliantCustomModeId as number) > 0 ? (pliantCustomModeId as number) : null;
  const none = (warning: string | null = PAYMENT_MODE_UNKNOWN): Mb3mPaymentAccount => ({
    mode: "None",
    bank,
    customModeId: null,
    warning,
  });
  if (/\bcheque\b/.test(text)) return { mode: "Check", bank, customModeId: null, warning: null };
  if (text.includes("prelevement") || text.includes("sepa") || /\bordre\b/.test(text)) {
    return { mode: "BankOrder", bank, customModeId: null, warning: null };
  }
  if (text.includes("espece") || /\bcash\b/.test(text)) return { mode: "Cash", bank, customModeId: null, warning: null };
  if (isPliantVirtualCard(text)) {
    if (customId) return { mode: "Custom", bank, customModeId: customId, warning: null };
    return { mode: "PaymentCard", bank, customModeId: null, warning: null };
  }
  if (source === "stripe" || text.includes("stripe") || text.includes("paiement en ligne") || text.includes("en ligne")) {
    return { mode: "OnlinePaymentCard", bank, customModeId: null, warning: null };
  }
  if (source === "pliant" || /carte|card|visa|mastercard|amex/.test(text)) {
    return { mode: "PaymentCard", bank, customModeId: null, warning: null };
  }
  if (source === "revolut" || /revolut|qonto|virement|transfer|wire/.test(text)) {
    return { mode: "BankTransfer", bank, customModeId: null, warning: null };
  }
  if (!text.trim()) return none();
  return none();
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
    customModeId?: number | null;
  },
  fetchImpl?: FetchImpl
) {
  const custom = input.mode === "Custom" && input.customModeId ? tag("CustomModeId", input.customModeId) : "";
  const inner = `<FolderSavePaymentRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Payment>${tag("Amount", money(input.amount))}${tag("BankAccount", input.bank.trim())}${custom}${tag("Date", `${dayStamp(input.date)}T00:00:00`)}${tag("FolderId", input.folderId.trim())}${tag("Mode", input.mode.trim())}${tag("Reference", input.reference.trim())}</Payment></FolderSavePaymentRequest>`;
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
  /** Dossier MB3M du règlement. Vide si la liste ne le porte pas. */
  folderId?: string | null;
  invoiceNumber: string | null;
  /** Reste à lettrer. 0 : déjà entièrement lettré. */
  unmatched: number;
};

/**
 * Règlements du client. FolderService n’a pas d’opération FindPayments
 * (ContractFilter). La même recherche que les factures, avec IncludePayments.
 * `folderId` limite à un dossier ; sans lui, la recherche est celle du client.
 */
export function mb3mFindPaymentsQuery(customerUid: string, pageIndex: number, pageSize = PIECE_PAGE_SIZE, folderId?: string | null) {
  const folder = (folderId || "").trim();
  const folderXml = folder ? `<FolderId>${escapeMb3mXml(folder)}</FolderId>` : "";
  return `<FolderFindPiecesQuery xmlns="http://schemas.mb3m.fr/Partners"><Customer><Uid>${escapeMb3mXml(customerUid.trim())}</Uid></Customer>${folderXml}<IncludeInvoices>true</IncludeInvoices><IncludePayments>true</IncludePayments><PageIndex>${pageIndex}</PageIndex><PageSize>${pageSize}</PageSize></FolderFindPiecesQuery>`;
}

const PAYMENT_BLOCK_TAGS = new Set(["Payment", "PaymentSummary", "Piece", "PieceSummary", "Invoice", "InvoiceSummary"]);

/** Balises de premier niveau. Un lettrage imbriqué dans une facture n’est pas un encaissement. */
function topLevelBlocks(xml: string, names: Set<string>) {
  const re = /<(\/?)([A-Za-z][\w]*)(?:\s[^>]*)?>/g;
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let name = "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const closing = match[1] === "/";
    const tag = match[2];
    if (!names.has(tag)) continue;
    if (!closing && depth === 0) {
      start = match.index;
      name = tag;
      depth = 1;
      continue;
    }
    if (tag !== name || depth === 0) continue;
    depth += closing ? -1 : 1;
    if (depth === 0 && start >= 0) {
      blocks.push(xml.slice(start, re.lastIndex));
      start = -1;
    }
  }
  return blocks;
}

function paymentKind(block: string) {
  return ["Type", "PieceType", "Kind", "Nature", "DocumentType", "PieceKind", "Category"]
    .map((name) => mb3mXmlText(block, name))
    .filter(Boolean)
    .join(" ");
}

function isPaymentBlock(block: string) {
  const tag = /^<([A-Za-z]+)/.exec(block)?.[1] || "";
  if (tag === "Payment" || tag === "PaymentSummary") return true;
  return /paye?ment|r[eè]glement|encaissement/i.test(paymentKind(block));
}

function paymentBlocks(xml: string) {
  const local = mb3mLocalNames(xml);
  return topLevelBlocks(local, PAYMENT_BLOCK_TAGS).filter(isPaymentBlock);
}

function withoutMatchings(block: string) {
  const line = /<(?:Matching|Lettering|Pointage|Affectation|Settlement)(?:\s[^>]*)?>[\s\S]*?<\/(?:Matching|Lettering|Pointage|Affectation|Settlement)>/g;
  const empty = /<(?:Matchings|Letterings|Pointages|Affectations|Settlements)(?:\s[^>]*)?>\s*<\/(?:Matchings|Letterings|Pointages|Affectations|Settlements)>/g;
  let current = block;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(line, "").replace(empty, "");
  }
  return current;
}

/** Montant, numéro et reste de l’encaissement, pas ceux du lettrage déjà fait. */
function paymentHead(block: string) {
  return withoutMatchings(withoutNestedIdentities(block));
}

function paymentNumber(block: string) {
  const head = paymentHead(block);
  const identity = head.match(/<Identity(?:\s[^>]*)?>[\s\S]*?<\/Identity>/)?.[0] || "";
  return mb3mXmlText(identity, "Number") || mb3mXmlText(head, "Number");
}

function paymentFromBlock(block: string): Mb3mRemotePayment | null {
  const head = paymentHead(block);
  const number = paymentNumber(block);
  const amount = Number(mb3mXmlText(head, "Amount") || mb3mXmlText(head, "Total") || mb3mXmlText(head, "TotalPrice"));
  const date = (
    mb3mXmlText(head, "Date") ||
    mb3mXmlText(head, "CreationDate") ||
    mb3mXmlText(head, "PieceDate") ||
    mb3mXmlText(head, "DatePayment") ||
    mb3mXmlText(head, "PaymentDate")
  ).slice(0, 10);
  if (!number || !Number.isFinite(amount) || amount <= 0) return null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const invoiceNumber = mb3mXmlText(head, "PieceNumber") || mb3mXmlText(head, "InvoiceNumber") || mb3mXmlText(block, "PieceNumber") || null;
  return {
    number,
    reference: mb3mXmlText(head, "Reference"),
    amount,
    date,
    folderId: paymentFolderId(block),
    invoiceNumber,
    unmatched: paymentUnmatched(block, amount),
  };
}

function paymentFolderId(block: string) {
  const direct = mb3mXmlText(block, "FolderId");
  if (direct) return direct;
  const folder = mb3mLocalNames(block).match(/<Folder(?:\s[^>]*)?>[\s\S]*?<\/Folder>/)?.[0] || "";
  return mb3mXmlText(folder, "Id") || null;
}

async function readPaymentPage(customerUid: string, page: number, pageSize: number, folderId: string | null, fetchImpl?: FetchImpl) {
  const xml = await mb3mSoap(
    "FolderService",
    "IFolderService",
    "FindAllPieces",
    mb3mFindPaymentsQuery(customerUid, page, pageSize, folderId),
    fetchImpl
  );
  assertOperation(xml);
  const local = mb3mLocalNames(xml);
  const payments = paymentBlocks(local).flatMap((block) => {
    const payment = paymentFromBlock(block);
    return payment ? [payment] : [];
  });
  const reported = Number(mb3mXmlText(local, "TotalCount"));
  const pageItems = topLevelBlocks(local, PAYMENT_BLOCK_TAGS);
  const done = !pageItems.length || pageItems.length < pageSize || (Number.isFinite(reported) && reported >= 0 && (page + 1) * pageSize >= reported);
  return { payments, done };
}

/**
 * Règlements du client, d’abord dans les dossiers donnés (le dossier de la facture en tête),
 * puis sur tout le client. Un règlement déjà lu dans un dossier n’est pas écrasé.
 */
export async function mb3mFindCustomerPayments(
  customerUid: string,
  fetchImpl?: FetchImpl,
  pageSize = PIECE_PAGE_SIZE,
  folderIds: string[] = []
): Promise<Mb3mRemotePayment[]> {
  const scopes: (string | null)[] = [
    ...new Set(folderIds.map((id) => id.trim()).filter(Boolean)),
    null,
  ];
  const seen = new Set<string>();
  const payments: Mb3mRemotePayment[] = [];
  let any = false;
  let lastError: Error | null = null;
  for (const folderId of scopes) {
    try {
      for (let page = 0; page < 40; page += 1) {
        const batch = await readPaymentPage(customerUid, page, pageSize, folderId, fetchImpl);
        any = true;
        for (const payment of batch.payments) {
          if (seen.has(payment.number)) continue;
          seen.add(payment.number);
          payments.push(payment);
        }
        if (batch.done) break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("lecture");
      console.error(`[mb3m] règlements ${folderId || "client"}`, lastError.message);
    }
  }
  if (!any && lastError) throw lastError;
  console.info(
    `[mb3m] règlements : ${payments.map((payment) => `${payment.number} dossier ${payment.folderId || "?"} reste ${payment.unmatched} sur ${payment.amount}`).join(", ") || "aucun"}`
  );
  return payments;
}

function paymentUnmatched(block: string, amount: number) {
  const head = paymentHead(block);
  const named = firstAmount(head, [
    "UnmatchedAmount",
    "RemainingAmount",
    "AmountToMatch",
    "LeftAmount",
    "LeftToPay",
    "AmountLeft",
    "Balance",
    "Solde",
    "UnletteredAmount",
    "LeftToLetter",
    "ResteALettrer",
    "NotMatchedAmount",
    "AmountNotMatched",
    "OpenAmount",
  ]);
  if (named != null) return Math.max(0, Math.round(named * 100) / 100);
  const matched = firstAmount(head, ["MatchedAmount", "AmountMatched", "LetteredAmount", "Matched"]);
  if (matched != null) return Math.max(0, Math.round((amount - matched) * 100) / 100);
  const parts = [...block.matchAll(/<(?:Matching|Lettering|Pointage|Affectation)(?:\s[^>]*)?>[\s\S]*?<\/(?:Matching|Lettering|Pointage|Affectation)>/g)];
  if (parts.length) {
    const used = parts.reduce((sum, part) => sum + (Number(mb3mXmlText(part[0], "Amount")) || 0), 0);
    return Math.max(0, Math.round((amount - used) * 100) / 100);
  }
  const lettered = Boolean(mb3mXmlText(head, "PieceNumber") || mb3mXmlText(head, "InvoiceNumber"));
  return lettered ? 0 : amount;
}

function firstAmount(block: string, names: string[]) {
  for (const name of names) {
    const raw = mb3mXmlText(block, name);
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export type Mb3mRemotePiece = {
  number: string;
  refCommand: string;
  folderId: string | null;
  cancelled: boolean;
  printed: boolean;
  /** Total TTC quand la liste le porte déjà (sinon le détail). */
  amount: number | null;
  /** Uid de la pièce, pas celui du client. */
  uid: string | null;
};

/** Client, dossier imbriqué et agence : leur Uid n’est pas celui de la pièce. */
function withoutNestedIdentities(xml: string) {
  return mb3mLocalNames(xml)
    .replace(/<CustomerIdentity(?:\s[^>]*)?>[\s\S]*?<\/CustomerIdentity>/g, "")
    .replace(/<FolderIdentity(?:\s[^>]*)?>[\s\S]*?<\/FolderIdentity>/g, "")
    .replace(/<Agency(?:\s[^>]*)?>[\s\S]*?<\/Agency>/g, "")
    .replace(/<Customer(?:\s[^>]*)?>[\s\S]*?<\/Customer>/g, "")
    .replace(/<Folder(?:\s[^>]*)?>[\s\S]*?<\/Folder>/g, "");
}

/**
 * Uid de la pièce elle-même. D’abord le bloc Identity, jamais le client ni le dossier
 * qui précèdent dans FindAllPieces.
 */
export function mb3mEntityUid(block: string) {
  const stripped = withoutNestedIdentities(block);
  const identity = stripped.match(/<Identity(?:\s[^>]*)?>[\s\S]*?<\/Identity>/)?.[0];
  if (identity) {
    const uid = mb3mXmlText(identity, "Uid");
    if (uid) return uid;
  }
  return mb3mXmlText(stripped, "Uid") || null;
}

function pieceOwnUid(block: string) {
  return mb3mEntityUid(block);
}

function pieceBlocks(xml: string) {
  const local = mb3mLocalNames(xml);
  return (
    local.match(
      /<(?:PieceSummary|InvoiceSummary|Piece|Invoice)(?:\s[^>]*)?>[\s\S]*?<\/(?:PieceSummary|InvoiceSummary|Piece|Invoice)>/g
    ) || []
  ).filter((block) => !/^<InvoiceLine[\s>]/.test(block));
}

function blockAmount(block: string) {
  const head = block.split(/<Lines>/)[0] || block;
  const headAmount = Number(mb3mXmlText(head, "Total") || mb3mXmlText(head, "Amount") || mb3mXmlText(head, "TotalPrice"));
  if (Number.isFinite(headAmount) && headAmount > 0) return Math.round(headAmount * 100) / 100;
  const lines = block.match(/<InvoiceLine(?:\s[^>]*)?>[\s\S]*?<\/InvoiceLine>/g) || [];
  const sum = lines.reduce((total, line) => {
    const net = Number(mb3mXmlText(line, "NetPriceTotal"));
    const margin = Number(mb3mXmlText(line, "MarginUnit"));
    return total + (Number.isFinite(net) ? net : 0) + (Number.isFinite(margin) ? margin : 0);
  }, 0);
  return sum > 0 ? Math.round(sum * 100) / 100 : null;
}

function blockCancelled(block: string) {
  return /<(?:Cancelled|IsCancelled)>\s*true\s*</i.test(block);
}

function blockPrinted(block: string) {
  return /<(?:DatePrint|PrintedDate)(?:\s[^>]*)?>\s*[^<\s][^<]*</.test(block);
}

const PIECE_PAGE_SIZE = 50;

/** Corps de FindAllPieces. Le contrat attend FolderFindPiecesQuery, pas une requête inventée. */
export function mb3mFindPiecesQuery(customerUid: string, pageIndex: number, pageSize = PIECE_PAGE_SIZE) {
  return `<FolderFindPiecesQuery xmlns="http://schemas.mb3m.fr/Partners"><Customer><Uid>${escapeMb3mXml(customerUid.trim())}</Uid></Customer><IncludeInvoices>true</IncludeInvoices><PageIndex>${pageIndex}</PageIndex><PageSize>${pageSize}</PageSize></FolderFindPiecesQuery>`;
}

function piecesOf(xml: string): Mb3mRemotePiece[] {
  return pieceBlocks(xml).flatMap((block) => {
    const number = mb3mXmlText(block, "Number");
    if (!number) return [];
    return [
      {
        number,
        refCommand: mb3mXmlText(block, "RefCommand"),
        folderId: mb3mXmlText(block, "FolderId") || null,
        cancelled: blockCancelled(block),
        printed: blockPrinted(block),
        amount: blockAmount(block),
        uid: pieceOwnUid(block),
      },
    ];
  });
}

/** Factures du client, toutes les pages. Le filtre est le client : un PNR ou un dossier ne filtre pas. */
export async function mb3mFindCustomerPieces(
  customerUid: string,
  fetchImpl?: FetchImpl,
  pageSize = PIECE_PAGE_SIZE
): Promise<Mb3mRemotePiece[]> {
  const seen = new Set<string>();
  const pieces: Mb3mRemotePiece[] = [];
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 40 && pieces.length < total; page += 1) {
    const xml = await mb3mSoap(
      "FolderService",
      "IFolderService",
      "FindAllPieces",
      mb3mFindPiecesQuery(customerUid, page, pageSize),
      fetchImpl
    );
    assertOperation(xml);
    const reported = Number(mb3mXmlText(xml, "TotalCount"));
    if (Number.isFinite(reported) && reported >= 0) total = reported;
    const batch = piecesOf(xml).filter((piece) => {
      if (seen.has(piece.number)) return false;
      seen.add(piece.number);
      return true;
    });
    pieces.push(...batch);
    if (!batch.length || batch.length < pageSize) break;
  }
  return pieces;
}

export type Mb3mRemoteInvoice = {
  number: string;
  refCommand: string;
  folderId: string | null;
  cancelled: boolean;
  amount: number | null;
  date: string | null;
  activityIds: number[];
  travelers: { firstName: string; lastName: string }[];
  printed: boolean;
  uid: string | null;
};

/** Détail d’une facture : PNR (`RefCommand`), billets (`RefPiece`), activité, voyageurs. */
export async function mb3mGetInvoice(number: string, fetchImpl?: FetchImpl): Promise<Mb3mRemoteInvoice> {
  const pieceNumber = number.trim();
  const attempts = [
    {
      action: "Get",
      inner: `<PieceGetRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${tag("Number", pieceNumber)}</PieceGetRequest>`,
    },
    {
      action: "GetInvoice",
      inner: `<PieceGetInvoiceRequest xmlns="http://schemas.mb3m.fr/Partners" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${tag("Number", pieceNumber)}</PieceGetInvoiceRequest>`,
    },
  ];
  let xml = "";
  let last: unknown;
  for (const attempt of attempts) {
    try {
      xml = await mb3mSoap("PieceService", "IPieceService", attempt.action, attempt.inner, fetchImpl);
      last = null;
      break;
    } catch (err) {
      last = err;
      const message = err instanceof Error ? err.message : "";
      if (!/ContractFilter|deserializ/i.test(message)) throw err;
    }
  }
  if (last) throw last;
  assertOperation(xml);
  const local = mb3mLocalNames(xml);
  const invoice = local.match(/<Invoice(?:\s[^>]*)?>[\s\S]*?<\/Invoice>/)?.[0] || local;
  const head = invoice.split("<Lines>")[0] || invoice;
  const lineBlocks = invoice.match(/<InvoiceLine(?:\s[^>]*)?>[\s\S]*?<\/InvoiceLine>/g) || [];
  const activityIds = lineBlocks.flatMap((block) => {
    const id = Number(mb3mXmlText(block, "ActivityId"));
    return Number.isInteger(id) && id > 0 ? [id] : [];
  });
  const lineSum = lineBlocks.reduce((sum, block) => {
    const net = Number(mb3mXmlText(block, "NetPriceTotal"));
    const margin = Number(mb3mXmlText(block, "MarginUnit"));
    const part = (Number.isFinite(net) ? net : 0) + (Number.isFinite(margin) ? margin : 0);
    return sum + part;
  }, 0);
  const headAmount = Number(mb3mXmlText(head, "Total") || mb3mXmlText(head, "Amount"));
  const amount = Number.isFinite(headAmount) && headAmount > 0 ? headAmount : lineSum > 0 ? Math.round(lineSum * 100) / 100 : null;
  const date = (mb3mXmlText(head, "Date") || mb3mXmlText(head, "DateStart")).slice(0, 10);
  const travelers = [...invoice.matchAll(/<Traveler(?:\s[^>]*)?>[\s\S]*?<\/Traveler>/g)].flatMap((match) => {
    const person = match[0].match(/<Person(?:\s[^>]*)?>[\s\S]*?<\/Person>/)?.[0] || match[0];
    const firstName = mb3mXmlText(person, "FirstName");
    const lastName = mb3mXmlText(person, "Name");
    return firstName || lastName ? [{ firstName, lastName }] : [];
  });
  return {
    number: mb3mXmlText(head, "Number") || number.trim(),
    refCommand: mb3mXmlText(head, "RefCommand") || mb3mXmlText(invoice, "RefCommand"),
    folderId: mb3mXmlText(head, "FolderId") || null,
    cancelled: blockCancelled(invoice),
    amount,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    activityIds,
    travelers,
    printed: blockPrinted(invoice),
    uid: pieceOwnUid(invoice),
  };
}

/**
 * Corps de IPieceService/ChangeFolder. NewFolder est une FolderIdentity.
 * IFolderService/ChangeFolder n’existe pas (ContractFilter).
 */
export function mb3mChangeFolderBody(input: {
  number: string;
  folderId: string;
  folderUid?: string | null;
  pieceUid?: string | null;
}) {
  const number = input.number.trim();
  const folderId = input.folderId.trim();
  const folderUid = (input.folderUid || "").trim();
  const pieceUid = (input.pieceUid || "").trim();
  return `<PieceChangeFolderRequest xmlns="http://schemas.mb3m.fr/Partners"><Uid>${escapeMb3mXml(pieceUid)}</Uid><Number>${escapeMb3mXml(number)}</Number><NewFolder><Id>${escapeMb3mXml(folderId)}</Id><Uid>${escapeMb3mXml(folderUid)}</Uid></NewFolder></PieceChangeFolderRequest>`;
}

/** Range une facture sans dossier dans le dossier du séjour. */
export async function mb3mChangeFolder(
  input: { number: string; folderId: string; folderUid?: string | null; pieceUid?: string | null },
  fetchImpl?: FetchImpl
) {
  const xml = await mb3mSoap("PieceService", "IPieceService", "ChangeFolder", mb3mChangeFolderBody(input), fetchImpl);
  assertOperation(xml);
  return { number: input.number.trim(), folderId: input.folderId.trim() };
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
