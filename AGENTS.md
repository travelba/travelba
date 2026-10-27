<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Travelba agent notes

- Always-on : `.cursor/rules/travelba-core.mdc`
- Index CRM : `.cursor/skills/travelba-voyage-crm/SKILL.md` (charger **un** skill spécialisé ensuite)
- Import PDF/photos (dropzone, relecture) : `.cursor/skills/travelba-document-ingest/SKILL.md`
- Gmail / `crm_email_ingest` (Little Emperors, Expedia TAAP, billet-avion, booking-cancellation, cdsgroupe.com ; `crm` et `reservations-tba` seulement si réponse à un envoi du CRM ; dépôt des pièces au clic, cartes seulement sur un second clic) : `.cursor/skills/travelba-email-ingest/SKILL.md`
- Formalité ETA-IL / ESTA / Royaume-Uni : `.cursor/skills/travelba-visa/SKILL.md`
- Création / clone local : `.cursor/skills/travelba-bootstrap/SKILL.md`
- Prod `travelba.fr` : `.cursor/skills/travelba-go-live/SKILL.md`
- Prefer shipping working CRM flows over speculative refactors.

## Cursor Cloud specific instructions

- `install` is `npm ci --include=optional` (lockfile, sharp, and the Chromium postinstall). `start` runs `npm run dev` on `0.0.0.0:3000` and skips the launch if that port already answers. Do not start a second dev server.
- Supabase URL, anon key, and service role arrive as environment variables. Do not copy them into `.env.local`. When `NEXT_PUBLIC_SITE_URL` is unset, `start` uses `http://localhost:3000`.
- Do not run `npm run seed:demo` in this environment: the Supabase project is production.
- Checks match CI: `npm run typecheck`, `npm run lint`, `npm run test`, then `node scripts/check-migrations.mjs`.
