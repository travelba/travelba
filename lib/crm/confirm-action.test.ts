import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmAction } from "../../components/crm/ConfirmAction";

test("ConfirmAction : un seul bouton armé, zone aria-live, tailles", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmAction, {
      label: "Retirer",
      question: "La pièce est supprimée du dossier.",
      onConfirm: async () => undefined,
      tone: "danger",
      size: "sm",
    })
  );
  assert.match(html, />Retirer</);
  assert.doesNotMatch(html, />Confirmer</);
  assert.doesNotMatch(html, /La pièce est supprimée/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /min-h-9/);
  assert.doesNotMatch(html, /min-h-11/);

  const md = renderToStaticMarkup(
    createElement(ConfirmAction, {
      label: "Archiver",
      confirmLabel: "Confirmer l’archivage",
      question: "Le client ne le voit plus.",
      onConfirm: async () => undefined,
    })
  );
  assert.match(md, /min-h-11/);
  assert.match(md, />Archiver</);
});
