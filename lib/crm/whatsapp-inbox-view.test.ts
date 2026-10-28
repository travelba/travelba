import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InboxMessage, InboxThread } from "./whatsapp-inbox";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") {
    return { useRouter: () => ({ refresh() {}, push() {} }) };
  }
  return load.call(this, request, parent, isMain);
};

const inboxModule = import("../../components/admin/WhatsappInbox");

function message(partial: Partial<InboxMessage> & Pick<InboxMessage, "id" | "createdAt" | "body">): InboxMessage {
  return {
    phone: "+33601020304",
    customerId: "client-1",
    customerName: "Camille Martin",
    bookingId: null,
    bookingReference: null,
    direction: "inbound",
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
    ...partial,
  };
}

const thread: InboxThread = {
  key: "+33601020304",
  phone: "+33601020304",
  customerId: "client-1",
  customerName: "Camille Martin",
  prospect: false,
  bookingId: null,
  bookingReference: null,
  lastBody: "Récent",
  lastAt: "2026-10-21T12:00:00.000Z",
  unread: 0,
  status: "agency",
  held: true,
};

test("la conversation admin montre le plus récent en haut et le bouton de remise", async () => {
  const { WhatsappInbox } = await inboxModule;
  const html = renderToStaticMarkup(
    createElement(WhatsappInbox, {
      threads: [thread],
      messages: [
        message({ id: "old", createdAt: "2026-10-21T08:00:00.000Z", body: "Message ancien" }),
        message({ id: "new", createdAt: "2026-10-21T12:00:00.000Z", body: "Message récent" }),
        message({
          id: "note",
          createdAt: "2026-10-21T12:05:00.000Z",
          direction: "outbound",
          body: "Conversation rendue au Concierge à 14h05",
          templateKey: "systeme",
        }),
      ],
      activeKey: thread.key,
      proposals: [],
      templates: [],
      windowOpen: true,
      previewBlocked: true,
    })
  );
  assert.match(html, /Repris par l’agence/);
  assert.match(html, /Rendre au Concierge/);
  assert.match(html, /Conversation rendue au Concierge à 14h05/);
  assert.ok(html.indexOf("Message récent") < html.indexOf("Message ancien"));
  assert.ok(html.indexOf("Conversation rendue au Concierge à 14h05") < html.indexOf("Message récent"));

test("une note vocale montre le lecteur et la transcription, sans télécharger le fichier", async () => {
  const { WhatsappInbox } = await inboxModule;
  const html = renderToStaticMarkup(
    createElement(WhatsappInbox, {
      threads: [thread],
      messages: [
        message({
          id: "voix",
          createdAt: "2026-10-21T12:00:00.000Z",
          body: "Note vocale : J'ai adoré la vue",
          mediaPath: "customers/client-1/whatsapp/note.wav",
        }),
        message({
          id: "muet",
          createdAt: "2026-10-21T12:01:00.000Z",
          body: "Note vocale (transcription indisponible)",
          mediaPath: "customers/client-1/whatsapp/muet.ogg",
        }),
        message({
          id: "pdf",
          createdAt: "2026-10-21T12:02:00.000Z",
          body: "Pièce reçue sur WhatsApp.",
          mediaPath: "customers/client-1/whatsapp/piece.pdf",
        }),
      ],
      activeKey: thread.key,
      proposals: [],
      templates: [],
      windowOpen: true,
      previewBlocked: true,
    })
  );
  assert.match(html, /<audio[^>]*preload="none"/);
  assert.match(html, /playsinline/i);
  assert.match(html, /aria-label="Note vocale"/);
  assert.match(html, /J&#x27;ai adoré la vue|J&#39;ai adoré la vue|J'ai adoré la vue/);
  assert.match(html, /Note vocale \(transcription indisponible\)/);
  assert.match(html, /\/api\/files\?path=customers%2Fclient-1%2Fwhatsapp%2Fnote\.wav/);
  assert.match(html, /Pièce jointe/);
  assert.equal(html.includes("customers/client-1/whatsapp/note.wav"), false);
  const player = html.slice(html.indexOf("<audio"), html.indexOf("</audio>") + 8);
  assert.match(player, /preload="none"/);
  assert.doesNotMatch(player, /preload="auto"|preload="metadata"/);
});
});
