import assert from "node:assert/strict";
import test from "node:test";
import { scoreExtractFields } from "./extract-confidence";
import { importTitleGuard } from "./import-title";
import { canAutoApply } from "./import-proposal";

/**
 * Jeu d’évaluation synthétique. Aucun mail réel, aucun numéro de pièce.
 * Chaque cas fixe le dossier attendu, les cartes et le titre.
 */
const CITIES = ["Lyon", "Nice", "Lisbonne", "Porto", "Venise", "Florence"] as const;

type EvalCase = {
  id: string;
  source: string;
  title: string;
  hotel: string;
  confirmation: string;
  quoted: boolean;
  reference: boolean;
  conflict: boolean;
  expectAuto: boolean;
  expectTitle: string;
};

function cases(): EvalCase[] {
  const out: EvalCase[] = [];
  for (const city of CITIES) {
    for (const variant of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const confirmation = `TB${city.slice(0, 3).toUpperCase()}${variant}99`;
      const quoted = variant % 2 === 0;
      const reference = variant < 4;
      const conflict = variant === 3;
      const hotel = `Maison ${city}`;
      const source = quoted
        ? `Confirmation ${confirmation}\n${hotel}\nSéjour à ${city}`
        : `Message commercial sans les détails de ${city}.`;
      out.push({
        id: `${city}-${variant}`,
        source,
        title: quoted ? city : `${city} · Hôtel départ`,
        hotel,
        confirmation,
        quoted,
        reference,
        conflict,
        expectAuto: quoted && reference && !conflict,
        expectTitle: city,
      });
    }
  }
  return out;
}

test("quarante-huit mails anonymes fixent dossier, cartes et titre", () => {
  const rows = cases();
  assert.equal(rows.length, 48);
  for (const row of rows) {
    const scored = scoreExtractFields(
      {
        title: row.quoted ? row.expectTitle : "Ville hors texte",
        destination: row.expectTitle,
        items: [
          {
            kind: "hotel",
            title: row.hotel,
            confirmation_ref: row.confirmation,
            details: { hotel_name: row.hotel, city: row.expectTitle },
          },
        ],
      },
      row.source
    );
    const guarded = importTitleGuard({
      title: row.title,
      destination: row.expectTitle,
      items: [
        {
          kind: "hotel",
          title: row.hotel,
          start_at: "2026-11-02",
          end_at: "2026-11-06",
          details: { hotel_name: row.hotel, city: row.expectTitle },
        },
      ],
    });
    const auto = canAutoApply({
      candidates: row.reference
        ? [{ booking_id: `dossier-${row.id}`, reason: "Référence fournisseur", score: 90 }]
        : [{ booking_id: `dossier-${row.id}`, reason: "Ajouter au dossier", score: 83 }],
      confidence: scored.confidence,
      conflict: row.conflict,
    });
    assert.equal(auto, row.expectAuto, row.id);
    assert.equal(guarded.title.includes(row.hotel), false, row.id);
    assert.match(guarded.title, new RegExp(row.expectTitle), row.id);
    assert.equal(row.confirmation.includes("P<"), false);
  }
});
