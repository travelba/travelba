import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parisMoment } from "../crm/concierge-when";
import { withConciergeSignature } from "../crm/whatsapp";

export const CONCIERGE_MAX_BUBBLES = 3;
export const CONCIERGE_MAX_BUBBLE_CHARS = 220;
export const CONCIERGE_BUBBLE_DELAY_MS = 1200;

export type BubbleLang = "fr" | "en" | "he";

export type BubbleHistory = {
  direction: "inbound" | "outbound";
  at?: string | null;
};

const GREETING = /^(?:bonjour|hello|שלום)\b[^,\n]*,\s*/i;
const SIGNATURE = /(?:^|\n)[ \t]*le concierge\.?[ \t]*$/i;

function skillDir() {
  return join(process.cwd(), "lib/concierge/skill");
}

/** Style et exemples, lus à chaque appel pour qu’un edit de Benjamin soit pris au prochain message. */
export function conciergeSkillPrompt() {
  const skill = readFileSync(join(skillDir(), "SKILL.md"), "utf8").trim();
  const examples = readFileSync(join(skillDir(), "examples.md"), "utf8").trim();
  return `${skill}\n\n${examples}`;
}

export function conciergeSkillVersion() {
  const skill = readFileSync(join(skillDir(), "SKILL.md"), "utf8");
  return skill.match(/^version:\s*(\S+)/m)?.[1] || "";
}

/** Premier message du jour à Paris : salutation et signature. Un fil déjà ouvert aujourd’hui n’en a plus. */
export function conciergeOpening(history: BubbleHistory[] | undefined, now: Date) {
  const outbound = (history || []).filter((row) => row.direction === "outbound" && (row.at || row.direction));
  if (!outbound.length) return true;
  const today = parisMoment(now).date;
  const dated = outbound.filter((row) => row.at);
  if (!dated.length) return false;
  return dated.every((row) => {
    const at = new Date(row.at || "");
    if (Number.isNaN(at.getTime())) return false;
    return parisMoment(at).date !== today;
  });
}

function stripSignature(text: string) {
  let body = text.replace(/\s+$/u, "");
  while (SIGNATURE.test(body)) body = body.replace(SIGNATURE, "").replace(/\s+$/u, "");
  return body.trim();
}

function splitPieces(text: string) {
  const clean = stripSignature(text).replace(GREETING, "");
  const lines = clean
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^le concierge\.?$/i.test(line));
  const pieces: string[] = [];
  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) {
      pieces.push(line);
      continue;
    }
    const bits = line
      .split(/(?<=[.!?])\s+(?=[\p{Lu}])/u)
      .map((bit) => bit.trim())
      .filter(Boolean);
    pieces.push(...(bits.length ? bits : [line]));
  }
  return pieces;
}

function lowerFirst(text: string, lang: BubbleLang) {
  if (lang === "he") return text;
  const lowered = text.replace(/^(\p{Lu})/u, (char) => char.toLocaleLowerCase(lang === "en" ? "en" : "fr"));
  if (lang === "en") return lowered.replace(/^i\b/, "I");
  return lowered;
}

function greet(firstName: string, lang: BubbleLang) {
  const name = firstName.trim();
  if (lang === "en") return name ? `Hello ${name},` : "Hello,";
  if (lang === "he") return name ? `שלום ${name},` : "שלום,";
  return name ? `Bonjour ${name},` : "Bonjour,";
}

function clip(text: string) {
  if (text.length <= CONCIERGE_MAX_BUBBLE_CHARS) return text;
  return `${text.slice(0, CONCIERGE_MAX_BUBBLE_CHARS - 1).trim()}…`;
}

function lead(text: string, lang: BubbleLang) {
  if (/^https?:\/\//i.test(text)) return text;
  const locale = lang === "en" ? "en" : "fr";
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * Découpe une réponse en bulles courtes.
 * À l’ouverture du jour, la première bulle porte la salutation (suite en minuscule) et la signature.
 */
export function packBubbles(input: {
  text: string;
  opening: boolean;
  firstName: string;
  lang: BubbleLang;
  block?: boolean;
}) {
  const raw = input.text.trim();
  if (!raw) return [];
  if (input.block) {
    const body = stripSignature(raw);
    return [input.opening ? withConciergeSignature(body) : body];
  }
  let pieces = splitPieces(raw)
    .map(clip)
    .slice(0, CONCIERGE_MAX_BUBBLES);
  if (!pieces.length) return [];
  if (!input.opening) return pieces.map((piece) => lead(piece, input.lang));
  const hello = greet(input.firstName, input.lang);
  const first = pieces[0];
  if (!/^(bonjour|hello|שלום)\b/i.test(first)) {
    const merged = `${hello} ${lowerFirst(first, input.lang)}`;
    pieces =
      merged.length <= CONCIERGE_MAX_BUBBLE_CHARS ? [merged, ...pieces.slice(1)] : [hello, first, ...pieces.slice(1)];
  }
  pieces = pieces.slice(0, CONCIERGE_MAX_BUBBLES);
  pieces[0] = withConciergeSignature(pieces[0]);
  return pieces;
}
