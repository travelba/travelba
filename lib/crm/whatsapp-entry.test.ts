import assert from "node:assert/strict";
import test from "node:test";
import { whatsappEntryLink } from "./whatsapp-entry";

type Row = Record<string, unknown>;

/** Service client factice : generateLink rend le user de l’e-mail, crm_entry_links garde les lignes. */
function fakeAdmin(users: { id: string; email: string; app_metadata: Record<string, unknown> }[], staffIds: string[] = []) {
  const rows: Row[] = [];
  const admin = {
    rows,
    from(table: string) {
      if (table === "crm_staff") {
        let id = "";
        const query = {
          select: () => query,
          eq: (_c: string, v: string) => ((id = v), query),
          maybeSingle: async () => ({ data: staffIds.includes(id) ? { id } : null, error: null }),
        };
        return query;
      }
      assert.equal(table, "crm_entry_links");
      return {
        insert: async (row: Row) => {
          rows.push(row);
          return { error: null };
        },
      };
    },
    auth: {
      admin: {
        async generateLink(args: { type: string; email: string }) {
          const user = users.find((row) => row.email === args.email);
          if (!user) return { data: { user: null, properties: null }, error: { message: "User not found" } };
          return { data: { user, properties: { hashed_token: `hash-${user.id}` } }, error: null };
        },
        async getUserById(id: string) {
          const user = users.find((row) => row.id === id);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "absent" } };
        },
      },
    },
  };
  return admin;
}

const ORIGIN = "https://travelba.fr";
const LINK = /^https:\/\/travelba\.fr\/e\/c\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

test("mot de passe déjà choisi : lien magique, la session s’ouvre", async () => {
  const admin = fakeAdmin([
    { id: "ok-1", email: "simon@example.com", app_metadata: { crm_role: "client", password_set_at: "2026-09-22T08:01:35.674Z" } },
  ]);
  const entry = await whatsappEntryLink(admin as never, ORIGIN, {
    email: "Simon@Example.com",
    nextPath: "/mon-compte/reservations/TB-2026-0044",
    showCover: true,
  });
  assert.ok(entry);
  assert.equal(entry.session, true);
  assert.match(entry.link, LINK);
  assert.equal(entry.suffix, `c/${entry.code}`);
  assert.equal(admin.rows.length, 1);
  assert.equal(admin.rows[0].token_hash, "hash-ok-1");
  assert.equal(admin.rows[0].otp_type, "magiclink");
  assert.equal(admin.rows[0].next_path, "/mon-compte/reservations/TB-2026-0044");
  assert.equal(admin.rows[0].channel, "whatsapp");
  assert.equal(admin.rows[0].show_cover, true);
  assert.equal(admin.rows[0].email, "simon@example.com");
});

test("pas encore de mot de passe : lien « connexion » sans jeton, même aperçu, vers /connexion", async () => {
  const admin = fakeAdmin([
    { id: "inv-1", email: "nina@example.com", app_metadata: { crm_role: "client", must_set_password: true } },
  ]);
  const entry = await whatsappEntryLink(admin as never, ORIGIN, {
    email: "nina@example.com",
    nextPath: "/mon-compte/reservations/TB-2026-0044",
    showCover: true,
  });
  assert.ok(entry);
  assert.equal(entry.session, false);
  assert.match(entry.link, LINK);
  assert.equal(admin.rows.length, 1);
  assert.equal(admin.rows[0].token_hash, null);
  assert.equal(admin.rows[0].otp_type, "connexion");
  assert.equal(admin.rows[0].next_path, "/mon-compte/reservations/TB-2026-0044");
  assert.equal(admin.rows[0].show_cover, true);
  // Vingt-quatre heures, comme un lien magique.
  const expires = Date.parse(String(admin.rows[0].expires_at));
  assert.ok(expires - Date.now() <= 24 * 60 * 60 * 1000 + 5000);
  assert.ok(expires - Date.now() > 23 * 60 * 60 * 1000);
});

test("compte de l’agence ou e-mail inconnu : aucun lien", async () => {
  const admin = fakeAdmin(
    [{ id: "admin-1", email: "marie@travelba.fr", app_metadata: { crm_role: "admin", password_set_at: "2026-09-15T00:00:00.000Z" } }],
    ["admin-1"]
  );
  assert.equal(await whatsappEntryLink(admin as never, ORIGIN, { email: "marie@travelba.fr", nextPath: "/mon-compte" }), null);
  assert.equal(await whatsappEntryLink(admin as never, ORIGIN, { email: "inconnu@example.com", nextPath: "/mon-compte" }), null);
  assert.equal(await whatsappEntryLink(admin as never, ORIGIN, { email: "", nextPath: "/mon-compte" }), null);
  assert.equal(admin.rows.length, 0);
});
