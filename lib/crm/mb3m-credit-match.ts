/**
 * Un crédit sans dossier, alors qu’un autre séjour est ouvert, peut quand même
 * payer la facture en cours. Le numéro de facture dans le libellé l’emporte.
 * Sinon, la société facturée, si elle est seule. Sinon on ne prend pas.
 */

export type Mb3mCreditPeer = {
  invoiceNumbers: string[];
  billingCompanyId: string | null;
  companyName: string | null;
};

const LEGAL_FORMS = new Set([
  "llc",
  "sarl",
  "sarlu",
  "sas",
  "sasu",
  "sa",
  "eurl",
  "sci",
  "snc",
  "scs",
  "scop",
  "selarl",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "gmbh",
  "ag",
  "bv",
  "nv",
  "plc",
  "corp",
  "corporation",
  "llp",
  "lp",
  "ulc",
  "pte",
  "pty",
]);

/** Numéro comparable : chiffres seuls, zéros de tête ignorés. */
export function invoiceNumberKey(value: string | null | undefined): string | null {
  const trimmed = (value || "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return trimmed.replace(/^0+/, "") || "0";
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u00a0/g, " ");
}

/** « L.L.C. » et « S.A.R.L. » deviennent llc et sarl, avant de retirer la forme. */
function collapseDottedInitials(value: string) {
  return value.replace(/(?:[a-z]\.){1,}[a-z]\.?/g, (seq) => seq.replace(/\./g, ""));
}

function withoutLegalForms(tokens: string[]) {
  const kept: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (LEGAL_FORMS.has(token)) continue;
    if (token.length === 1 && /[a-z]/.test(token)) {
      let end = index;
      let glued = "";
      while (end < tokens.length && tokens[end].length === 1 && /[a-z]/.test(tokens[end])) {
        glued += tokens[end];
        end += 1;
      }
      if (glued.length >= 2 && LEGAL_FORMS.has(glued)) {
        index = end - 1;
        continue;
      }
    }
    kept.push(token);
  }
  return kept;
}

/** Raison sociale comparable : casse, accents et forme juridique ignorés. */
export function companyMatchKey(name: string | null | undefined) {
  const tokens = withoutLegalForms(
    collapseDottedInitials(fold(name || ""))
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  return tokens.join(" ");
}

function tokensOf(value: string) {
  return withoutLegalForms(collapseDottedInitials(fold(value)).split(/[^a-z0-9]+/).filter(Boolean));
}

/** Le libellé nomme cette société, mots entiers, forme juridique ignorée. */
export function labelNamesCompany(label: string, companyName: string | null | undefined) {
  const needle = companyMatchKey(companyName).split(" ").filter(Boolean);
  if (!needle.length || needle.join(" ").length < 3) return false;
  const haystack = tokensOf(label);
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

function maskDates(label: string) {
  return label
    .replace(/\b\d{4}[/.\\-]\d{1,2}[/.\\-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[/.\\-]\d{1,2}[/.\\-]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}[/.\\-]\d{1,2}\b/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retire les montants écrits (2 767,61, 2203,50) pour ne pas les lire comme un n° de facture. */
function maskAmounts(label: string, amount: number) {
  let next = label.replace(/\d{1,3}(?:[ \u00a0.]\d{3})+[,.]\d{2}/g, " ").replace(/\d+[,.]\d{2}\b/g, " ");
  const cents = Math.round(Math.abs(amount) * 100);
  const euros = Math.floor(cents / 100);
  const cent = String(cents % 100).padStart(2, "0");
  const heads = new Set<string>([String(euros)]);
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (grouped !== String(euros)) {
    heads.add(grouped);
    heads.add(grouped.replace(/ /g, "."));
    heads.add(grouped.replace(/ /g, "\u00a0"));
  }
  const forms = new Set<string>();
  for (const head of heads) {
    forms.add(`${head},${cent}`);
    forms.add(`${head}.${cent}`);
    if (cent === "00") forms.add(head);
  }
  for (const form of [...forms].sort((left, right) => right.length - left.length)) {
    if (form.length < 2) continue;
    next = next.replace(new RegExp(`(^|\\D)${escapeRegExp(form)}(?!\\d)`, "g"), "$1 ");
  }
  return next;
}

const NUMBER_TAIL = String.raw`(?!\d)(?![A-Za-z])(?![,.]\d)`;

function collect(label: string, pattern: RegExp, into: Set<string>) {
  pattern.lastIndex = 0;
  for (const match of label.matchAll(pattern)) {
    const key = invoiceNumberKey(match[1]);
    if (key) into.add(key);
  }
}

function isCompactDate(digits: string) {
  return /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(digits);
}

/** Le montant du crédit écrit tel quel, sans préfixe de facture. Les zéros de tête restent un numéro. */
function isBareAmount(digits: string, amount: number) {
  if (/^0\d/.test(digits)) return false;
  const value = Number(digits);
  return Number.isFinite(value) && Math.abs(value - amount) < 0.001;
}

/**
 * Numéros de facture cités dans le libellé.
 * Formes acceptées : N:002203, 002203, facture 2203, N°2203, FA2203, F002203.
 * Le numéro entier, zéros de tête ignorés. Pas un montant, pas une date, pas un mot collé.
 */
export function invoiceKeysInLabel(label: string, amount: number) {
  const dated = maskDates(label);
  const found = new Set<string>();
  collect(dated, new RegExp(String.raw`\bfacture\b[^0-9A-Za-z]{0,8}(\d+)${NUMBER_TAIL}`, "gi"), found);
  collect(dated, new RegExp(String.raw`\bN\s*[°º:.]\s*(\d+)${NUMBER_TAIL}`, "gi"), found);
  collect(dated, new RegExp(String.raw`\bFA(\d+)${NUMBER_TAIL}`, "gi"), found);
  collect(dated, new RegExp(String.raw`\bF(0\d+)${NUMBER_TAIL}`, "gi"), found);
  const bare = maskAmounts(dated, amount);
  const barePattern = new RegExp(String.raw`(?:^|[^A-Za-z0-9])(\d+)${NUMBER_TAIL}`, "g");
  for (const match of bare.matchAll(barePattern)) {
    const digits = match[1];
    if (isBareAmount(digits, amount) || isCompactDate(digits)) continue;
    const key = invoiceNumberKey(digits);
    if (key) found.add(key);
  }
  return found;
}

export function labelCitesInvoice(label: string, invoiceNumber: string, amount: number) {
  const key = invoiceNumberKey(invoiceNumber);
  return Boolean(key && invoiceKeysInLabel(label, amount).has(key));
}

function sameCompany(
  left: { id: string | null; name: string | null },
  right: { id: string | null; name: string | null }
) {
  if (left.id && right.id && left.id === right.id) return true;
  const leftKey = companyMatchKey(left.name);
  const rightKey = companyMatchKey(right.name);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

/**
 * Vrai si ce crédit sans dossier paie le séjour en cours.
 * Sans liste des autres dossiers, on ne tranche pas : l’appelant garde l’ancien refus.
 */
export function unattachedCreditBelongsToFolder(input: {
  label: string;
  amount: number;
  billingCompanyId: string | null;
  invoiceNumber: string;
  folderCompanyId: string | null;
  folderCompanyName: string | null;
  peers: Mb3mCreditPeer[] | null | undefined;
}) {
  if (!input.peers) return false;
  const mentioned = invoiceKeysInLabel(input.label, input.amount);
  const ownKey = invoiceNumberKey(input.invoiceNumber);
  const otherInvoice = input.peers.some((peer) =>
    peer.invoiceNumbers.some((number) => {
      const key = invoiceNumberKey(number);
      return Boolean(key && mentioned.has(key));
    })
  );
  if (otherInvoice) return false;
  if (ownKey && mentioned.has(ownKey)) return true;
  const folder = { id: input.folderCompanyId, name: input.folderCompanyName };
  const posted = Boolean(input.folderCompanyId && input.billingCompanyId === input.folderCompanyId);
  const named = labelNamesCompany(input.label, input.folderCompanyName);
  if (!posted && !named) return false;
  for (const peer of input.peers) {
    const peerCompany = { id: peer.billingCompanyId, name: peer.companyName };
    if (sameCompany(folder, peerCompany)) return false;
    if (labelNamesCompany(input.label, peer.companyName)) return false;
  }
  return true;
}

export type Mb3mCreditMatchContext = {
  peers: Mb3mCreditPeer[] | null;
  folderCompanyName: string | null;
};

/** Contexte lu dans le CRM. `failed` : on ne rapproche pas, le crédit ambigu reste écarté. */
export function mb3mCreditMatchContext(input: {
  folderCompanyId: string | null;
  peers: { id: string; billingCompanyId: string | null }[];
  companies: { id: string; companyName: string | null }[];
  pieces: { bookingId: string; pieceNumber: string | null }[];
  failed: boolean;
}): Mb3mCreditMatchContext {
  if (input.failed) return { peers: null, folderCompanyName: null };
  const names = new Map(input.companies.map((row) => [row.id, row.companyName]));
  const numbers = new Map<string, string[]>();
  for (const row of input.pieces) {
    const number = (row.pieceNumber || "").trim();
    if (!number) continue;
    const list = numbers.get(row.bookingId) || [];
    list.push(number);
    numbers.set(row.bookingId, list);
  }
  return {
    folderCompanyName: input.folderCompanyId ? names.get(input.folderCompanyId) || null : null,
    peers: input.peers.map((peer) => ({
      billingCompanyId: peer.billingCompanyId,
      companyName: peer.billingCompanyId ? names.get(peer.billingCompanyId) || null : null,
      invoiceNumbers: numbers.get(peer.id) || [],
    })),
  };
}
