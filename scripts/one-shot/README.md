# Scripts ponctuels (déjà joués en prod, gardés pour mémoire)

- `backfill-le-hotel-contacts.ts` — 2026-09-29 : écrit l'annuaire Little Emperors sur les cartes hôtel existantes (`npx tsx scripts/one-shot/backfill-le-hotel-contacts.ts`, `.env.local` à la racine).
- `backfill-le-hotel-gallery.ts` — 2026-10-21 : pose l’identifiant Little Emperors et les photos de la catégorie réservée (`npx tsx scripts/one-shot/backfill-le-hotel-gallery.ts`, `DRY=1` pour simuler).
- `import-le-hotel-contacts.mjs` — 2026-09-29 : charge l'export JSON Little Emperors dans `crm_le_hotels` / `crm_hotel_contacts` (`node scripts/one-shot/import-le-hotel-contacts.mjs <export.json>`, fichier hors git).
- `retouch-catalog.ts` — 2026-09-24 : télécharge et retouche les couvertures du catalogue dans `public/` (`npx tsx scripts/one-shot/retouch-catalog.ts`).
