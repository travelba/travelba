# Travel BA — marque validée (2026-10-07)

Badge circulaire **TBA · TRAVEL BUSINESS AGENCY**. Remplace le cercle « TBA seul » (2026-09-24) et l’ancienne variante « LUXURY TRAVEL ».

## Mark

- Disque marine `#0B192C`, coins transparents (le badge est un cercle)
- Filet champagne fin `#C5A880`
- Monogramme **TBA** champagne, géométrique, interlettré
- Filet séparateur fin, puis le sous-titre **TRAVEL BUSINESS AGENCY** en capitales interlettrées

Source vectorielle : `logo-tba.svg` (texte vectorisé, aucune police requise). Toutes les tailles PNG en sont tirées.

## Monogramme seul

Sous ~200 px le sous-titre n’est plus lisible : les favicons (16, 32, 48) et l’icône iOS (180) portent le **monogramme seul** (disque, filet, TBA), même style. Source : `logo-tba-mark.svg`. Les favicons ont un filet plus épais et des lettres plus grandes pour rester nets après réduction.

## Files

| Path | Use |
|------|-----|
| `logo-tba.svg` | Source vectorielle du badge complet |
| `logo-tba.png` | UI (1280 master, `siteConfig.logoSrc`, e-mails) |
| `logo-tba-256.png` | En-tête des PDF (`lib/crm/brand-logo.ts`, copie base64 `lib/crm/brand-logo.b64`) |
| `travelba-whatsapp-badge-only.png` | WhatsApp profile crop (640, même badge) |
| `logo-tba-mark.svg` | Source vectorielle du monogramme seul |
| `/tba-mark.png` `/og-concierge.png` | 512 opaque sur carré marine (WhatsApp / réseaux aplatissent la transparence) |
| `/og-concierge.jpg` | Image sociale 1200×630, badge centré sur marine |
| `/favicon.ico` | Favicon du domaine, lu par WhatsApp (`public/` + `app/`). ICO 32, 16 et 48 : monogramme opaque sur marine, pas de fond transparent |
| `/favicon-16.png` `/favicon-32.png` `/favicon-48.png` | Mêmes tailles en PNG opaque |
| `/favicon.png` | 512 badge complet (also `app/icon.png`) |
| `/apple-touch-icon.png` | iOS home screen (180, monogramme seul, also `app/apple-icon.png`) |
