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

const dockModule = import("../../components/admin/WhatsappDock");

const threads: InboxThread[] = [
  {
    key: "+33601020304",
    phone: "+33601020304",
    customerId: "client-camille",
    customerName: "Camille Martin",
    prospect: false,
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    lastBody: "Le transfert est confirmé.",
    lastAt: "2026-10-20T10:20:00Z",
    unread: 0,
    status: "agency",
  },
  {
    key: "+33611111111",
    phone: "+33611111111",
    customerId: null,
    customerName: null,
    prospect: true,
    bookingId: null,
    bookingReference: null,
    lastBody: "Lisbonne",
    lastAt: "2026-10-20T10:05:00Z",
    unread: 1,
    status: "robot",
  },
];

const message: InboxMessage = {
  id: "m1",
  phone: "+33601020304",
  customerId: "client-camille",
  customerName: "Camille Martin",
  bookingId: "sejour-exemple",
  bookingReference: "TB-EXEMPLE",
  direction: "inbound",
  body: "Bonjour",
  createdAt: "2026-10-20T08:12:00Z",
  status: "received",
  templateKey: null,
  authorName: null,
  mediaPath: null,
  tools: [],
  requestId: null,
};

function render(props: Record<string, unknown>) {
  return dockModule.then(({ WhatsappDock }) =>
    renderToStaticMarkup(
      createElement(WhatsappDock, {
        threads,
        templates: [],
        previewBlocked: true,
        live: false,
        persist: false,
        messagesByKey: { "+33601020304": [message] },
        ...props,
      })
    )
  );
}

test("le fil ouvert sur téléphone a Fermer et Réduire, le bureau garde sa croix", async () => {
  const html = await render({
    initialPanelOpen: true,
    initialTabs: [{ key: "+33601020304", expanded: true }],
  });
  assert.match(html, /aria-label="Discussion avec Camille Martin"/);
  assert.match(html, /aria-label="Retour"/);
  assert.match(html, /aria-label="Réduire Camille Martin"/);
  assert.match(html, /aria-label="Fermer Camille Martin"/);
  assert.match(html, /h-11 w-11/);
  assert.match(html, /safe-area-inset-top/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /lg:hidden/);
  assert.match(html, /Rendre au concierge/);
  assert.match(html, /px-1 text-xs text-white\/70/);
  assert.doesNotMatch(html, /max-h-\[70vh\]/);
  assert.match(html, />Replier</);
});

test("la liste téléphone est une feuille plein écran avec Fermer", async () => {
  const html = await render({ initialDrawer: true });
  assert.match(html, /aria-label="Discussions WhatsApp"/);
  assert.match(html, /aria-label="Fermer les discussions"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /h-11 w-11/);
  assert.match(html, /safe-area-inset-top/);
  assert.doesNotMatch(html, /w-\[min\(100%,22rem\)\]/);
});

test("la bulle affiche les non-lus et reste au-dessus de la barre", async () => {
  const html = await render({});
  assert.match(html, /aria-label="Discussions WhatsApp, 1 non lu"/);
  assert.match(html, /bottom-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(html, /lg:hidden/);
});
