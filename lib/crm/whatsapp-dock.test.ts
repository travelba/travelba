import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDockMessage,
  closeDockTab,
  dockInitials,
  dockLabel,
  dockStatusLabel,
  ensureDockTab,
  freshDockThreads,
  openDockTab,
  readDockState,
  splitDockTabs,
} from "./whatsapp-dock";
import type { InboxMessage, InboxThread } from "./whatsapp-inbox";

function thread(patch: Partial<InboxThread> & Pick<InboxThread, "key" | "lastAt">): InboxThread {
  return {
    phone: patch.key,
    customerId: "c1",
    customerName: "Camille Martin",
    prospect: false,
    bookingId: null,
    bookingReference: null,
    lastBody: "Bonjour",
    unread: 0,
    status: "robot",
    ...patch,
  };
}

function inbound(patch: Partial<InboxMessage> & Pick<InboxMessage, "createdAt" | "body">): InboxMessage {
  return {
    id: "m",
    phone: "+33601020304",
    customerId: "c1",
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
    ...patch,
  };
}

test("le panneau remonte le fil entrant et ouvre un onglet sans en déplier deux", () => {
  const older = thread({ key: "+33601020304", lastAt: "2026-10-20T08:00:00Z", unread: 0 });
  const other = thread({
    key: "+33611111111",
    phone: "+33611111111",
    customerId: null,
    customerName: null,
    prospect: true,
    lastAt: "2026-10-20T09:00:00Z",
    lastBody: "Lisbonne",
    status: "robot",
  });
  const next = applyDockMessage(
    [other, older],
    inbound({ phone: "+33601020304", createdAt: "2026-10-20T10:00:00Z", body: "Une question" })
  );
  assert.equal(next[0].key, "+33601020304");
  assert.equal(next[0].unread, 1);
  assert.equal(dockLabel(other), "+33611111111");
  assert.equal(dockInitials(older), "CM");
  assert.equal(dockInitials(other), "11");
  assert.equal(dockStatusLabel("agency"), "Agence");
  assert.equal(dockStatusLabel("robot"), "Concierge");
  const tabs = openDockTab(openDockTab([], older.key, true), other.key, true);
  assert.equal(tabs.filter((tab) => tab.expanded).length, 1);
  assert.equal(tabs.at(-1)?.key, other.key);
  const parked = ensureDockTab(tabs, "+33622222222");
  assert.equal(parked.at(-1)?.expanded, false);
  const split = splitDockTabs(
    ["a", "b", "c", "d", "e"].map((key, index) => ({ key, expanded: index === 0 })),
    4
  );
  assert.equal(split.visible.some((tab) => tab.key === "a"), true);
  assert.equal(split.visible.length, 4);
  assert.equal(closeDockTab(tabs, other.key).some((tab) => tab.key === other.key), false);
  assert.deepEqual(readDockState("{"), { panelOpen: false, tabs: [] });
  assert.equal(readDockState(JSON.stringify({ panelOpen: true, tabs: [{ key: older.key, expanded: true }] })).panelOpen, true);
  assert.equal(freshDockThreads([older], next).some((row) => row.key === older.key), true);
});
