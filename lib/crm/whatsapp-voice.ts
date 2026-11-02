import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe, gateway } from "ai";
import { aiGatewayConfigured, openaiApiKey } from "./ingest-types";

/** Affiché dans le fil, et seul texte connu du Concierge, quand la transcription échoue. */
export const VOICE_NOTE_UNAVAILABLE = "Note vocale (transcription indisponible)";

const AUDIO_TYPES: Record<string, { mime: string; ext: string }> = {
  "audio/ogg": { mime: "audio/ogg", ext: "ogg" },
  "audio/opus": { mime: "audio/ogg", ext: "ogg" },
  "audio/mpeg": { mime: "audio/mpeg", ext: "mp3" },
  "audio/mp3": { mime: "audio/mpeg", ext: "mp3" },
  "audio/mp4": { mime: "audio/mp4", ext: "m4a" },
  "audio/m4a": { mime: "audio/mp4", ext: "m4a" },
  "audio/x-m4a": { mime: "audio/mp4", ext: "m4a" },
  "audio/aac": { mime: "audio/aac", ext: "aac" },
  "audio/wav": { mime: "audio/wav", ext: "wav" },
  "audio/x-wav": { mime: "audio/wav", ext: "wav" },
  "audio/wave": { mime: "audio/wav", ext: "wav" },
  "audio/webm": { mime: "audio/webm", ext: "webm" },
  "audio/amr": { mime: "audio/amr", ext: "amr" },
};

const VOICE_MODELS = ["gpt-4o-transcribe", "whisper-1"] as const;
export type VoiceModelId = (typeof VOICE_MODELS)[number];

const PLAYABLE_EXT = new Set(["mp3", "m4a", "aac", "wav"]);
const STORED_WAV_MAX = 16_000_000;
const VOICE_RATE = 16_000;

/** `audio/ogg; codecs=opus` devient un type stockable. Le reste est ignoré. */
export function normalizeAudioType(value: string | null | undefined) {
  const type = (value || "").split(";")[0].trim().toLowerCase();
  return AUDIO_TYPES[type] || null;
}

export function inboundAudio(params: Record<string, string>) {
  const audio = normalizeAudioType(params.MediaContentType0);
  const url = (params.MediaUrl0 || "").trim();
  if (!audio || !url) return null;
  return { url, ...audio };
}

/** Texte passé au Concierge : les mots entendus, marqués comme note vocale. */
export function voiceNoteText(transcript: string) {
  const text = transcript.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return `Note vocale : ${text}`;
}

/** Retire la phrase d’échec pour que le modèle ne la prenne pas pour des paroles. */
export function withoutUnheardVoice(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== VOICE_NOTE_UNAVAILABLE)
    .join("\n");
}

/** Même coffre que les pièces WhatsApp. Sans fiche : dossier d’entrée, staff seulement. */
export function voiceNoteStoragePath(customerId: string | null, ext: string, id = crypto.randomUUID()) {
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
  const folder =
    customerId && /^[0-9a-f-]{36}$/i.test(customerId)
      ? `customers/${customerId}/whatsapp`
      : "whatsapp/inbound";
  return `${folder}/${id}.${safeExt}`;
}

/** gpt-4o-transcribe d’abord, whisper-1 ensuite. `WHATSAPP_TRANSCRIBE_MODEL=whisper-1` inverse. */
export function voiceTranscribeModels(env: Record<string, string | undefined> = process.env): VoiceModelId[] {
  const raw = (env.WHATSAPP_TRANSCRIBE_MODEL || "").trim();
  if (raw === "whisper-1") return [VOICE_MODELS[1], VOICE_MODELS[0]];
  return [...VOICE_MODELS];
}

/** WAV 16 kHz mono. Les notes Ogg ne se lisent pas sur iPhone ; ce fichier, si. */
export function pcmToWav(samples: Float32Array, sampleRate: number) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function mixMono(channels: Float32Array[]) {
  const first = channels[0];
  if (!first || channels.length === 1) return first || new Float32Array();
  const out = new Float32Array(first.length);
  for (let i = 0; i < first.length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] || 0;
    out[i] = sum / channels.length;
  }
  return out;
}

function downsample(samples: Float32Array, from: number, to: number) {
  if (from <= to) return samples;
  const ratio = from / to;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += samples[j] || 0;
      count += 1;
    }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

async function oggToWav(bytes: Uint8Array) {
  const { OggOpusDecoder } = await import("ogg-opus-decoder");
  const decoder = new OggOpusDecoder();
  try {
    await decoder.ready;
    const decoded = await decoder.decodeFile(bytes);
    if (!decoded.samplesDecoded || !decoded.channelData?.[0]?.length) return null;
    const voice = downsample(mixMono(decoded.channelData), decoded.sampleRate, VOICE_RATE);
    if (!voice.length || voice.length * 2 + 44 > STORED_WAV_MAX) return null;
    return pcmToWav(voice, VOICE_RATE);
  } finally {
    decoder.free();
  }
}

/**
 * Le fichier gardé se lit dans le navigateur, y compris sur mobile.
 * Un Ogg Opus devient un WAV. Si la conversion échoue, l’original reste.
 */
export async function toPlayableVoice(input: { bytes: Uint8Array; contentType: string }) {
  const audio = normalizeAudioType(input.contentType);
  if (!audio) return { bytes: input.bytes, contentType: input.contentType };
  if (audio.ext === "ogg") {
    try {
      const wav = await oggToWav(input.bytes);
      if (wav) return { bytes: wav, contentType: "audio/wav" };
    } catch (err) {
      console.error("[whatsapp-voice] conversion", err instanceof Error ? err.name : "error");
    }
  }
  if (PLAYABLE_EXT.has(audio.ext) || audio.ext === "ogg" || audio.ext === "webm" || audio.ext === "amr") {
    return { bytes: input.bytes, contentType: audio.mime };
  }
  return { bytes: input.bytes, contentType: audio.mime };
}

type TranscribeCall = (input: { modelId: VoiceModelId; bytes: Uint8Array; contentType: string }) => Promise<string>;

function gatewayReady(env: Record<string, string | undefined>) {
  if (env === process.env) return aiGatewayConfigured();
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || env.VERCEL);
}

function directKey(env: Record<string, string | undefined>) {
  if (env === process.env) return openaiApiKey();
  const key = env.OPENAI_API_KEY || "";
  return key.startsWith("sk-") ? key : "";
}

async function defaultTranscribe(input: { modelId: VoiceModelId; bytes: Uint8Array }, env: Record<string, string | undefined>) {
  const key = directKey(env);
  if (!key && !gatewayReady(env)) throw new Error("no-ai");
  const model = key
    ? createOpenAI({ apiKey: key }).transcription(input.modelId)
    : gateway.transcriptionModel(`openai/${input.modelId}`);
  // Pas de `language` : détection automatique. Le français est le cas le plus fréquent, pas une contrainte.
  const result = await transcribe({
    model,
    audio: input.bytes,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(15_000),
  });
  return result.text || "";
}

/** Transcription. Null si les deux modèles échouent ou si aucun fournisseur n’est configuré. */
export async function transcribeWhatsappAudio(input: {
  bytes: Uint8Array;
  contentType: string;
  env?: Record<string, string | undefined>;
  transcribeImpl?: TranscribeCall;
}): Promise<string | null> {
  const env = input.env || process.env;
  const impl = input.transcribeImpl || ((call) => defaultTranscribe(call, env));
  for (const modelId of voiceTranscribeModels(env)) {
    try {
      const text = (await impl({ modelId, bytes: input.bytes, contentType: input.contentType })).replace(/\s+/g, " ").trim();
      if (text) return text;
      console.error("[whatsapp-voice] transcription", modelId);
    } catch (err) {
      console.error("[whatsapp-voice] transcription", modelId, err instanceof Error ? err.name : "error");
    }
  }
  return null;
}
