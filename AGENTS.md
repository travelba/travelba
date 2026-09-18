<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Travelba agent notes

- Always-on : `.cursor/rules/travelba-core.mdc`
- Index CRM : `.cursor/skills/travelba-voyage-crm/SKILL.md` (charger **un** skill spécialisé ensuite)
- Import PDF/photos (qualité carnet) : `.cursor/skills/travelba-document-ingest/SKILL.md`
- Création / clone local : `.cursor/skills/travelba-bootstrap/SKILL.md`
- Prod `travelba.fr` : `.cursor/skills/travelba-go-live/SKILL.md`
- Prefer shipping working CRM flows over speculative refactors.
