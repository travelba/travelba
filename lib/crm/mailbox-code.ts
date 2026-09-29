/** Code à 6 chiffres lu dans la boîte agence. Aucun chiffre n’est journalisé. */

export const MAILBOX_CODE_MISSING = "Le code à six chiffres n’est pas dans la boîte agence.";

export const MAILBOX_CODE_UNTYPED = "Le code à six chiffres n’a pas pu être saisi.";

export const MAILBOX_CODE_ENTERED =
  "Code à 6 chiffres saisi depuis la boîte agence. Ne le redemande pas. Continue le formulaire.";

const CODE_HINT = /verif\w*|otp|passcode|one-time|6[-\s]?digit|authentication code|קוד/i;

/** L’écran, ou un hold, demande le code envoyé par courriel. */
export function mailboxCodeAsked(text: string) {
  if (/saisi depuis la boîte/i.test(text)) return false;
  return /6[-\s]?digit|six chiffres|code to 6|code de v[eé]rification|verification code|email address verification|sent a\b.{0,24}\bcode|envoy[eé].{0,40}code/i.test(
    text
  );
}

function foldMail(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/\u00a0/g, " ");
}

/** Six chiffres isolés, à côté d’un libellé de vérification. Pas un numéro plus long. */
export function extractVerificationCode(text: string): string | null {
  const flat = foldMail(text);
  const hint = CODE_HINT.exec(flat);
  if (!hint || hint.index === undefined) return null;
  const slice = flat.slice(Math.max(0, hint.index - 80), hint.index + 140);
  const exact = slice.match(/(?:^|[^A-Za-z0-9])(\d{6})(?![A-Za-z0-9])/);
  if (exact) return exact[1];
  const spaced = slice.match(/(?:^|[^A-Za-z0-9])(\d{3})[\s.\-](\d{3})(?![A-Za-z0-9])/);
  if (spaced) return `${spaced[1]}${spaced[2]}`;
  return null;
}

export type MailboxNote = {
  subject: string;
  text: string;
  receivedAt: string | null;
};

/** Le plus récent, arrivé autour de l’écran de vérification. */
export function pickVerificationCode(messages: MailboxNote[], sinceMs: number): string | null {
  const fresh = messages
    .map((message) => ({ message, at: message.receivedAt ? Date.parse(message.receivedAt) : Number.NaN }))
    .filter((row) => Number.isFinite(row.at) && row.at >= sinceMs - 180_000)
    .sort((a, b) => b.at - a.at);
  for (const row of fresh) {
    const code = extractVerificationCode(`${row.message.subject}\n${row.message.text}`);
    if (code) return code;
  }
  return null;
}

export function verificationMailQuery() {
  return 'newer_than:1d (verification OR verify OR otp OR passcode OR "one-time" OR "6-digit" OR "6 digit")';
}

export async function pollVerificationCode(opts: {
  sinceMs: number;
  query: string;
  search: (query: string, max?: number) => Promise<MailboxNote[]>;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  waitMs?: number;
  max?: number;
}): Promise<string | null> {
  const attempts = opts.attempts ?? 8;
  const waitMs = opts.waitMs ?? 4000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const messages = await opts.search(opts.query, opts.max ?? 8);
      const code = pickVerificationCode(messages, opts.sinceMs);
      if (code) return code;
    } catch {
      // La boîte peut répondre trop tôt. On réessaie.
    }
    if (attempt + 1 < attempts) await sleep(waitMs);
  }
  return null;
}
