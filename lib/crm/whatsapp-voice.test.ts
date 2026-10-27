import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadTwilioAudio } from "./whatsapp-inbound";
import { isVoiceNotePath, schemaMissesColumn } from "./whatsapp-inbox";
import {
  inboundAudio,
  normalizeAudioType,
  pcmToWav,
  toPlayableVoice,
  transcribeWhatsappAudio,
  voiceNoteStoragePath,
  voiceNoteText,
  voiceTranscribeModels,
  VOICE_NOTE_UNAVAILABLE,
  withoutUnheardVoice,
} from "./whatsapp-voice";

test("une note vocale Ogg est reconnue, un PDF ne l’est pas", () => {
  const audio = inboundAudio({
    MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Media/ME1",
    MediaContentType0: "audio/ogg; codecs=opus",
  });
  assert.equal(audio?.mime, "audio/ogg");
  assert.equal(audio?.ext, "ogg");
  assert.equal(normalizeAudioType("image/jpeg"), null);
  assert.deepEqual(normalizeAudioType("audio/mpeg"), normalizeAudioType("audio/mp3"));
  assert.equal(inboundAudio({ MediaContentType0: "audio/ogg" }), null);
  assert.equal(isVoiceNotePath("customers/x/whatsapp/note.wav"), true);
  assert.equal(isVoiceNotePath("customers/x/whatsapp/piece.pdf"), false);
  assert.equal(voiceNoteText("  bonjour   le vol  "), "Note vocale : bonjour le vol");
  assert.equal(voiceNoteText("   "), null);
  assert.equal(withoutUnheardVoice(`Bonjour\n${VOICE_NOTE_UNAVAILABLE}`), "Bonjour");
  assert.equal(withoutUnheardVoice(VOICE_NOTE_UNAVAILABLE), "");
});

test("le fichier audio suit le coffre du client", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(voiceNoteStoragePath(id, "wav", "note"), `customers/${id}/whatsapp/note.wav`);
  assert.equal(voiceNoteStoragePath("pas-un-uuid", "ogg", "note"), "whatsapp/inbound/note.ogg");
  assert.equal(voiceNoteStoragePath(null, "wav", "note"), "whatsapp/inbound/note.wav");
  assert.equal(schemaMissesColumn({ message: "Could not find the transcript column of crm_whatsapp_messages in the schema cache" }, "transcript"), true);
  assert.equal(schemaMissesColumn({ message: "duplicate key" }, "transcript"), false);
});

test("le modèle entend la langue tout seul, whisper-1 reprend si le premier échoue", async () => {
  assert.deepEqual(voiceTranscribeModels({}), ["gpt-4o-transcribe", "whisper-1"]);
  assert.deepEqual(voiceTranscribeModels({ WHATSAPP_TRANSCRIBE_MODEL: "whisper-1" }), ["whisper-1", "gpt-4o-transcribe"]);
  assert.deepEqual(voiceTranscribeModels({ WHATSAPP_TRANSCRIBE_MODEL: "autre" }), ["gpt-4o-transcribe", "whisper-1"]);

  const calls: string[] = [];
  const text = await transcribeWhatsappAudio({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "audio/ogg",
    env: {},
    transcribeImpl: async (input) => {
      calls.push(input.modelId);
      assert.equal("language" in input, false);
      if (input.modelId === "gpt-4o-transcribe") throw new Error("rate");
      return "  bonjour  ";
    },
  });
  assert.deepEqual(calls, ["gpt-4o-transcribe", "whisper-1"]);
  assert.equal(text, "bonjour");

  const silent = console.error;
  console.error = () => undefined;
  try {
    const missing = await transcribeWhatsappAudio({
      bytes: new Uint8Array([1]),
      contentType: "audio/ogg",
      env: {},
    });
    assert.equal(missing, null);
  } finally {
    console.error = silent;
  }
});

test("le téléchargement Twilio reste sur api.twilio.com", async () => {
  const blocked = await downloadTwilioAudio({
    url: "https://example.com/note.ogg",
    accountSid: "ACtest",
    authToken: "secret",
    fetchImpl: async () => {
      assert.fail("hors Twilio");
    },
  });
  assert.equal(blocked, null);

  const image = await downloadTwilioAudio({
    url: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Media/ME1",
    accountSid: "ACtest",
    authToken: "secret",
    fetchImpl: async () => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }),
  });
  assert.equal(image, null);

  let auth = "";
  const audio = new Uint8Array([4, 5, 6]);
  const file = await downloadTwilioAudio({
    url: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Media/ME1",
    accountSid: "ACtest",
    authToken: "secret",
    fetchImpl: async (_url, init) => {
      auth = new Headers(init?.headers).get("authorization") || "";
      return new Response(audio, { status: 200, headers: { "content-type": "audio/ogg; codecs=opus" } });
    },
  });
  assert.equal(auth, `Basic ${Buffer.from("ACtest:secret").toString("base64")}`);
  assert.equal(file?.contentType, "audio/ogg");
  assert.deepEqual(file?.bytes, audio);
});

test("un mp3 reste un mp3, un ogg illisible aussi, un wav se lit partout", async () => {
  const mp3 = new Uint8Array([1, 2, 3]);
  const kept = await toPlayableVoice({ bytes: mp3, contentType: "audio/mpeg" });
  assert.equal(kept.contentType, "audio/mpeg");
  assert.equal(kept.bytes, mp3);

  const ogg = new Uint8Array([79, 103, 103, 83]);
  const fallback = await toPlayableVoice({ bytes: ogg, contentType: "audio/ogg" });
  assert.equal(fallback.contentType, "audio/ogg");
  assert.equal(fallback.bytes, ogg);

  const wav = pcmToWav(new Float32Array([0, 0.5, -1]), 16000);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  assert.equal(wav.length, 44 + 6);
});

test("un Ogg Opus réel devient un WAV 16 kHz", async () => {
  const ogg = Buffer.from(
    "T2dnUwACAAAAAAAAAADemSd/AAAAAGuEkvEBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAN6ZJ38BAAAAO599TgE+T3B1c1RhZ3MNAAAATGF2ZjYwLjE2LjEwMAEAAAAdAAAAZW5jb2Rlcj1MYXZjNjAuMzEuMTAyIGxpYm9wdXNPZ2dTAAQYMAAAAAAAAN6ZJ38CAAAAtI4QRQ1FLTI8NjcuNS0sMCwzeIIBt2x+QOYAAAq+mqe+/7aF1wpx4N1roOPGxcMyxmQebmNSOkUMilOPRBiwjGSr7JiWeWxUUzBVToLkFspZSdjHCV1ZeKM/96yYhQNXT87RdhOWMcBhIADljOWvRwG3yk4vJSlREI+/RaSsh9kQ7WtYeJujElbOI3Zy7VwMi1FYKOC3Yyms8LQkMLRb6RxW5MPSGPauymCNjqjDwNEAajoH5KJ4m6MRtBy/qJsXXiNPnr9GzZckLc+Jz2CjeH3WwgHthCJeCsyop2zEabgZ+MjghX8ta64nWNdc7ZoASR94m6NfdZz8RdDFUbT6kaMotq0p6sqjHczN8oiYv611hGlsdJ080oVJ/Z0w+TEyKJrzScsWBlp4m6MXS92wD3/8QjKLKNSBwzuf03iLcm6ii9AubZXFFA5dU1dw1fXGavKO3hpDV/JrMlSPjX/XeJujX3Wc/ElKInG42Ndh7/CPUXDOJsR/fkuRDu4SOE7Z8i+Z4xhvFfBIQjp4VHiboxJWziN2e1nAgo0Rb0nhqGenIa9NYjRf6IeXhVuNlcy8aOTuZ5JfhSZ1JfY5RoBKlwDFeJujElbOH+oRGfqhW3ZnP1IP6JeWDd3jiYbRmpzxBjRZn/wmm1aJMwfJsKoWSJsrH3Wc/EXQxgIu6a2ysk6R7UubVnps4Cr7zKwHgfX3cIIfDmUVX1yA3EBImyrSU6pEuBwNISx9S86IFNDYJrPULMz/z2Sa/GYUQtpP3wtOgRWsqHP0bg8M8oBImysfdZz8STK9AXj9Fqtsdb7H93ih5DrW2KWhhgK17ksJUYawUu16RkwcYEibu5AHdQsf9Z6BuFJQGCGQwgOpL4Fo5dvIhY0BoNIISi+w3Cy/JfTFKyrsMulZulOTQA==",
    "base64",
  );
  const playable = await toPlayableVoice({ bytes: new Uint8Array(ogg), contentType: "audio/ogg; codecs=opus" });
  assert.equal(playable.contentType, "audio/wav");
  assert.equal(String.fromCharCode(...playable.bytes.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...playable.bytes.slice(8, 12)), "WAVE");
  const view = new DataView(playable.bytes.buffer, playable.bytes.byteOffset, playable.bytes.byteLength);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.ok(playable.bytes.length > 44);
});
