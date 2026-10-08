import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrmBookingItem, CrmHotelRequest } from "./types";

function hotel(): CrmBookingItem {
  return {
    id: "item-hotel",
    booking_id: "b1",
    kind: "hotel",
    title: "The Berkeley",
    supplier: "",
    confirmation_ref: "HB-9",
    start_at: "2026-10-29",
    end_at: "2026-11-03",
    amount: 2703,
    include_in_ledger: false,
    sort_order: 0,
    details: { hotel_name: "The Berkeley", city: "Londres" },
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
}

function letter(kind: CrmHotelRequest["kind"], id: string): CrmHotelRequest {
  return {
    id,
    booking_id: "b1",
    booking_item_id: "item-hotel",
    kind,
    status: "draft",
    recipients: [],
    subject: "",
    body: "",
    edited: false,
    card_choice: null,
    attach_passports: false,
    due_on: null,
    sent_at: null,
    follow_up_count: 0,
    last_follow_up_at: null,
    replied_at: null,
    reply_from: "",
    reply_subject: "",
    reply_body: "",
    reply_message_id: null,
    created_at: "",
    updated_at: "",
  };
}

test("sur téléphone l’étape hôtel montre le nom, les dates, le prix et le courrier", async () => {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
  const load = Module._load;
  Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
    if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
    return load.call(this, request, parent, isMain);
  };
  try {
    const { BookingItemsPanel } = await import("../../components/admin/BookingItemsPanel");
    const html = renderToStaticMarkup(
      createElement(BookingItemsPanel, {
        bookingId: "b1",
        items: [hotel()],
        currency: "EUR",
        hotelRequests: [
          letter("payment_link", "r1"),
          letter("upgrade", "r2"),
          letter("precheckin", "r3"),
        ],
      })
    );
    const phone = html.slice(html.indexOf('data-step-layout="phone"'), html.indexOf('data-step-layout="desk"'));
    assert.match(phone, /The Berkeley/);
    assert.match(phone, /29 oct/);
    assert.match(phone, /3 nov/);
    assert.match(phone, /2[\s\u00a0\u202f]*703/);
    assert.doesNotMatch(phone, /w-16/);
    assert.match(html, /lg:hidden">[\s\S]*Il reste[\s\S]*Lien de paiement/);
    assert.match(html, /Écrire à l’hôtel/);
    assert.match(html, /Modifier/);
    assert.match(html, /lg:flex-row/);
    assert.match(html, /data-step-layout="desk"/);
  } finally {
    Module._load = load;
  }
});
