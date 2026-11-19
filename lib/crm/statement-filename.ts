/**
 * Nom du fichier téléchargé :
 * `Relevé de compte TBA - Khiari - Novembre 2026.pdf`.
 * Les accents restent. Les caractères interdits dans un nom de fichier sortent.
 */

const FRENCH_MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

const MONTH_PATTERN = FRENCH_MONTHS.join("|");
const DOWNLOAD_NAME = new RegExp(
  `^Relevé de compte TBA - \\S(?:.*\\S)? - (?:${MONTH_PATTERN}) \\d{4}\\.pdf$`,
  "u"
);

/** Repli quand l’en-tête n’a pas de nom. Même valeur que `STATEMENT_FILENAME`. */
export const STATEMENT_LEGACY_FILENAME = "Releve-de-compte.pdf";

const MAX_FILENAME = 180;
const MAX_HOLDER = 120;

export type StatementFilePeriod = {
  /** 1 = janvier. */
  month: number;
  year: number;
};

export type StatementFileHolder = {
  lastName?: string | null;
  last_name?: string | null;
  companyName?: string | null;
  company_name?: string | null;
};

function cleanFilePart(value: string | null | undefined) {
  const cleaned = (value || "")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>:"/\\|?*%#]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .normalize("NFC")
    .trim();
  return cleaned;
}

function holderName(holder: StatementFileHolder) {
  const last = cleanFilePart(holder.lastName ?? holder.last_name);
  if (last) return last.slice(0, MAX_HOLDER).trim() || "Client";
  const company = cleanFilePart(holder.companyName ?? holder.company_name);
  if (company) return company.slice(0, MAX_HOLDER).trim() || "Client";
  return "Client";
}

function validPeriod(period: StatementFilePeriod | null | undefined) {
  if (!period) return null;
  if (!Number.isInteger(period.month) || period.month < 1 || period.month > 12) return null;
  if (!Number.isInteger(period.year) || period.year < 1900 || period.year > 2200) return null;
  return period;
}

/** Mois civil à Paris. Null si la date n’est pas lisible. */
export function statementParisMonth(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthLabel(period: StatementFilePeriod) {
  return `${FRENCH_MONTHS[period.month - 1]} ${period.year}`;
}

function extensionOf(value: string | null | undefined) {
  const ext = (value || "pdf").replace(/^\./, "").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "pdf";
}

/**
 * Nom de famille de la fiche. Sans nom de famille, le nom de la société.
 * La période du relevé si elle est donnée, sinon le mois de l’export (Paris).
 */
export function statementExportName(
  holder: StatementFileHolder,
  options?: {
    period?: StatementFilePeriod | null;
    issuedAt?: Date | null;
    extension?: string | null;
  }
) {
  const who = holderName(holder);
  const period = validPeriod(options?.period) || statementParisMonth(options?.issuedAt || new Date()) || statementParisMonth(new Date());
  const when = period ? monthLabel(period) : "Releve";
  const extension = extensionOf(options?.extension);
  const suffix = `.${extension}`;
  const stem = `Relevé de compte TBA - ${who} - ${when}`;
  const room = MAX_FILENAME - suffix.length;
  const fitted = stem.length <= room ? stem : stem.slice(0, room).trim();
  return `${fitted}${suffix}`.normalize("NFC");
}

/** Vrai pour un nom produit ici, extension pdf seulement : la route WhatsApp ne sert que ce PDF. */
export function isStatementDownloadName(filename: string) {
  const name = filename.normalize("NFC");
  if (name.length > MAX_FILENAME || name.length < 24) return false;
  if (/[\u0000-\u001f"\\/]/.test(name) || name.includes("..")) return false;
  return DOWNLOAD_NAME.test(name);
}

function asciiFallback(value: string) {
  return value
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");
}

/** `filename` ASCII, `filename*` UTF-8. Les accents restent dans le nom réel. */
export function statementContentDisposition(filename: string) {
  const unicode = filename.normalize("NFC").replace(/[\r\n"\\]/g, "").slice(0, MAX_FILENAME);
  const ascii = asciiFallback(unicode).replace(/["\\]/g, "").trim() || "Releve de compte TBA.pdf";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(unicode)}`;
}

/** Le bouton lit `filename*` pour garder les accents, puis le repli ASCII. */
export function statementFilenameFromDisposition(header: string | null | undefined) {
  if (!header) return STATEMENT_LEGACY_FILENAME;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      const decoded = decodeURIComponent(star[1]).normalize("NFC");
      if (decoded && !/[\r\n"\\]/.test(decoded)) return decoded;
    } catch {
      /* le repli ASCII suit */
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  return STATEMENT_LEGACY_FILENAME;
}
