import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentMails } from "../../components/admin/RecentMails";
import { dashboardMailLines } from "./dashboard-mails";
import type { HotelTemplateReply } from "./hotel-reply-list";

function reply(patch: Partial<HotelTemplateReply> = {}): HotelTemplateReply {
  return {
    id: "reply-1",
    bookingId: "booking-1",
    itemId: "item-1",
    hotel: "Casa Monti",
    excerpt: "L’upgrade est confirmé.",
    receivedAt: "2026-10-06T12:00:00.000Z",
    href: "/admin/reservations/booking-1?hotel=item-1",
    reference: "TB-1042",
    subject: "Upgrade et accueil — Casa Monti",
    kindLabel: "Upgrade et accueil",
    ...patch,
  };
}

test("le tableau de bord ne garde que les réponses aux courriers du CRM", () => {
  const lines = dashboardMailLines([
    reply({ id: "upgrade", receivedAt: "2026-10-06T12:00:00.000Z", kindLabel: "Upgrade et accueil" }),
    reply({ id: "libre", receivedAt: "2026-10-07T08:00:00.000Z", kindLabel: "" }),
    reply({ id: "lien", receivedAt: "2026-10-05T09:00:00.000Z", kindLabel: "Lien de paiement" }),
  ]);
  assert.deepEqual(
    lines.map((line) => line.id),
    ["upgrade", "lien"]
  );
  assert.equal(lines[0]?.mark, "Upgrade et accueil");
  assert.equal(lines[0]?.detail, "TB-1042 · L’upgrade est confirmé.");
  assert.equal(lines[0]?.href, "/admin/reservations/booking-1?hotel=item-1");
  assert.equal(lines.some((line) => line.mark === "Expedia TAAP"), false);
});

test("la liste nomme l’hôtel et le courrier", () => {
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: dashboardMailLines([reply()]) }));
  assert.match(html, /Derniers mails/);
  assert.match(html, /Réponses des hôtels aux courriers envoyés/);
  assert.match(html, /Casa Monti/);
  assert.match(html, /Upgrade et accueil/);
  assert.equal(html.includes("Expedia"), false);
});

test("sans réponse, la liste le dit", () => {
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: [] }));
  assert.match(html, /Aucune réponse d’hôtel pour le moment/);
});
