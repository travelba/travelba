import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectionJournal } from "../../components/admin/ConnectionJournal";
import { sessionsFromLogins, type JournalAction, type JournalLogin } from "./connection-journal";

function login(partial: Partial<JournalLogin> & Pick<JournalLogin, "id" | "at">): JournalLogin {
  return { customerId: "c1", method: "password", ...partial };
}

function action(partial: Partial<JournalAction> & Pick<JournalAction, "id" | "at">): JournalAction {
  return { customerId: "c1", summary: "A ouvert l’accueil", detail: null, ...partial };
}

test("un geste suit la connexion qui le précède, pas la suivante", () => {
  const sessions = sessionsFromLogins(
    [
      login({ id: "late", at: "2026-10-13T09:00:00.000Z", method: "magiclink" }),
      login({ id: "early", at: "2026-10-12T08:00:00.000Z" }),
    ],
    [
      action({ id: "before", at: "2026-10-11T08:00:00.000Z", summary: "Trop tôt" }),
      action({ id: "mid", at: "2026-10-12T10:00:00.000Z", summary: "A ouvert ses séjours" }),
      action({ id: "after", at: "2026-10-13T09:05:00.000Z", summary: "A ouvert sa fiche", detail: "Téléphone" }),
    ]
  );
  assert.deepEqual(
    sessions.map((session) => [session.login.id, session.actions.map((row) => row.id)]),
    [
      ["late", ["after"]],
      ["early", ["mid"]],
    ]
  );
});

test("deux clients ne partagent pas leurs gestes", () => {
  const sessions = sessionsFromLogins(
    [login({ id: "a", customerId: "a", at: "2026-10-13T09:00:00.000Z" })],
    [action({ id: "other", customerId: "b", at: "2026-10-13T09:05:00.000Z" })]
  );
  assert.deepEqual(sessions[0].actions, []);
});

test("le journal montre la connexion et, au clic, le geste", () => {
  const html = renderToStaticMarkup(
    createElement(ConnectionJournal, {
      sessions: [
        {
          id: "login-1",
          customerId: "client-1",
          name: "Camille Martin",
          method: "password",
          at: "2026-10-13T07:15:00.000Z",
          actions: [
            {
              id: "act-1",
              at: "2026-10-13T07:16:00.000Z",
              summary: "A ouvert le séjour Avoriaz (TB-2026-0028)",
              detail: "20 mars → 27 mars",
            },
          ],
        },
      ],
    })
  );
  assert.match(html, /Connexions/);
  assert.match(html, /Camille Martin/);
  assert.match(html, /Mot de passe/);
  assert.match(html, /1 geste/);
  assert.match(html, /A ouvert le séjour Avoriaz \(TB-2026-0028\)/);
  assert.match(html, /href="\/admin\/clients\/client-1"/);
  assert.doesNotMatch(html, /@/);
});

test("sans connexion, le journal le dit", () => {
  const html = renderToStaticMarkup(createElement(ConnectionJournal, { sessions: [] }));
  assert.match(html, /Aucune connexion pour le moment/);
});
