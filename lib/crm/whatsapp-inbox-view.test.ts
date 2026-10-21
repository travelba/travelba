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
});
