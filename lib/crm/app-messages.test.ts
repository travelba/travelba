import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyMessageNotice,
  agencyReplyPush,
  canReadThread,
  clipBody,
  customerUnreadCount,
  inboxOrder,
  messageFilePath,
  openCustomerThread,
  openStaffThread,
  ownsAttachment,
  postAgencyReply,
  postCustomerMessage,
  sniffPhoto,
  type MessageDb,
  type MessageRow,
  type ThreadRow,
} from "./app-messages";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function memory(): MessageDb & { threads: ThreadRow[]; messages: MessageRow[] } {
  const threads: ThreadRow[] = [];
  const messages: MessageRow[] = [];
  return {
    threads,
    messages,
    async threadByCustomer(customerId) {
      return threads.find((row) => row.customerId === customerId) || null;
    },
    async threadById(id) {
      return threads.find((row) => row.id === id) || null;
    },
    async insertThread(row) {
      threads.push(row);
      return row;
    },
    async saveThread(row) {
      const index = threads.findIndex((item) => item.id === row.id);
      if (index >= 0) threads[index] = row;
    },
    async listMessages(threadId) {
      return messages.filter((row) => row.threadId === threadId);
    },
    async insertMessage(row) {
      messages.push(row);
      return row;
    },
    async saveMessages(rows) {
      for (const row of rows) {
        const index = messages.findIndex((item) => item.id === row.id);
        if (index >= 0) messages[index] = row;
      }
    },
    async listThreads() {
      return threads;
    },
  };
}

test("un client ne lit pas le fil d’un autre, et un message vide est refusé", () => {
  assert.equal(canReadThread({ kind: "customer", customerId: CLIENT }, { customerId: OTHER }), false);
  assert.equal(canReadThread({ kind: "customer", customerId: CLIENT }, { customerId: CLIENT }), true);
  assert.equal(canReadThread({ kind: "staff", customerId: CLIENT }, { customerId: OTHER }), true);
  assert.equal(clipBody("   ").text, "");
  assert.equal(clipBody("a".repeat(4001)).ok, false);
  assert.equal(ownsAttachment(CLIENT, `customers/${OTHER}/messages/x.jpg`), false);
  assert.equal(ownsAttachment(CLIENT, `customers/${CLIENT}/messages/../secret.jpg`), false);
  assert.equal(sniffPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "image/png"), "image/jpeg");
  assert.equal(sniffPhoto(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "image/jpeg"), null);
});

test("le client écrit, l’agence a un non-lu, la réponse réveille le client, l’ouverture accuse réception", async () => {
  const db = memory();
  const sent = await postCustomerMessage(db, {
    customerId: CLIENT,
    body: "Bonjour, le transfert de 9 h est confirmé ?",
    bookingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(sent.thread.agencyUnread, 1);
  assert.equal(sent.thread.customerUnread, 0);
  assert.equal(sent.message.readAt, null);
  const outsider = await openCustomerThread(db, OTHER);
  assert.equal(outsider.thread, null);
  assert.equal(await customerUnreadCount(db, OTHER), 0);

  const reply = await postAgencyReply(db, { threadId: sent.thread.id, staffId: STAFF, body: "Oui, le chauffeur sera à l’arrivée." });
  assert.equal(reply.ok, true);
  if (!reply.ok) return;
  assert.equal(reply.thread.customerUnread, 1);
  assert.equal(agencyReplyPush(reply.preview).title, "Message de l’agence");
  assert.match(agencyReplyPush(reply.preview).body, /chauffeur/);
  assert.match(agencyMessageNotice({ name: "Camille Martin", preview: sent.preview }).text, /Camille Martin/);
  assert.doesNotMatch(agencyMessageNotice({ name: "Camille Martin", preview: "Bonjour" }).text, /@/);

  const opened = await openCustomerThread(db, CLIENT);
  assert.equal(opened.thread?.customerUnread, 0);
  assert.equal(opened.messages.find((row) => row.authorKind === "agency")?.readAt == null, false);
  assert.equal(await customerUnreadCount(db, CLIENT), 0);

  const staff = await openStaffThread(db, sent.thread.id);
  assert.equal(staff?.thread.agencyUnread, 0);
  assert.equal(staff?.messages.find((row) => row.authorKind === "customer")?.readAt == null, false);
  assert.equal((await postAgencyReply(db, { threadId: OTHER, staffId: STAFF, body: "Non" })).ok, false);
});

test("une photo seule part, un chemin hors du client non", async () => {
  const db = memory();
  const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const path = messageFilePath(CLIENT, id, "image/jpeg");
  assert.equal(path, `customers/${CLIENT}/messages/${id}.jpg`);
  const photo = await postCustomerMessage(db, { customerId: CLIENT, body: "", messageId: id, attachmentPath: path, attachmentMime: "image/jpeg" });
  assert.equal(photo.ok, true);
  if (photo.ok) assert.equal(photo.preview, "Photo");
  const stolen = await postCustomerMessage(db, {
    customerId: CLIENT,
    body: "",
    attachmentPath: messageFilePath(OTHER, id, "image/jpeg"),
  });
  assert.equal(stolen.ok, false);
});

test("la file agence met les non-lus devant", () => {
  const old: ThreadRow = {
    id: "1",
    customerId: CLIENT,
    bookingId: null,
    customerUnread: 0,
    agencyUnread: 0,
    lastMessageAt: "2026-11-20T10:00:00Z",
    lastPreview: "ancien",
  };
  const fresh: ThreadRow = {
    id: "2",
    customerId: OTHER,
    bookingId: null,
    customerUnread: 0,
    agencyUnread: 2,
    lastMessageAt: "2026-11-19T10:00:00Z",
    lastPreview: "nouveau",
  };
  assert.deepEqual(inboxOrder([old, fresh]).map((row) => row.id), ["2", "1"]);
});
