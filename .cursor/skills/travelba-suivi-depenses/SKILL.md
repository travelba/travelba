---
name: travelba-suivi-depenses
description: >-
  Rules for Travelba client expense / devis follow-up: public /devis page,
  short URL /d/{code}, quote_lines, quote_token, and RPC get_public_voyage_quote.
  Use when editing devis page, short-links /d/, quote lines, expense tracking,
  or when the user mentions suivi des dépenses, devis client, or travelba.fr/d/.
---

# Travelba — Suivi des dépenses

## Produit

Page client publique du **devis / suivi des dépenses** (montants, lignes, dates).

- Lien long : `/devis/{quote_token}`
- Lien court WhatsApp : `https://travelba.fr/d/{short_code}` → redirect vers `/devis/…`

Libellé client (WhatsApp) : **Suivie des dépenses** (orthographe produit telle quelle).

## Règles absolues

1. Le client suit les dépenses via le **lien web vivant** (pas un PDF figé seul).
2. Les lignes viennent de `quote_lines` (import confirmations + édition CRM).
3. Titres de lignes = métier (vols, hôtels) — **jamais** « Capture d’écran… »  
   → skill `travelba-confirmation-import`.
4. Accès public uniquement via token / `short_code` (RPC security definer).

## Flux

1. Création voyage → `quote_token` + `short_code`  
2. Import PDF/captures → `quote_lines`  
3. Agent édite montants / titres dans le CRM  
4. WhatsApp dossier envoie `travelba.fr/d/{short_code}`  
5. Client ouvre `/devis/…` (données à jour via RPC)

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `app/devis/[token]/page.tsx` | UI client |
| `lib/agency/public-quote.ts` | RPC `get_public_voyage_quote` |
| `lib/agency/short-links.ts` | `/d/[code]` redirect |
| `app/d/[code]/route.ts` | Redirect public |
| `lib/agency/quote-link.ts` | `buildShortExpenseUrl`, tokens |
| `lib/mtrip/quote-lines.ts` | Lignes devis + dates |
| `components/admin/QuoteLinesEditor.tsx` | Édition CRM |

## DB (Supabase project travelba)

- Colonne `agency_mtrip_guides.quote_token`, `short_code`
- RPC `get_public_voyage_quote(p_token)`
- RPC `get_public_voyage_short_links(p_code)` → token + traveler URL

## Ne pas faire

- Exposer l’API admin sans auth pour le devis  
- Envoyer uniquement un PDF Storage sans lien `/d/` ou `/devis/`  
- Titres de lignes = noms de fichiers screenshot  

## Quand ça casse

| Symptôme | Piste |
|----------|--------|
| `/d/` → home | `short_code` absent / RPC fail |
| Devis vide | `quote_lines` vides ou token faux |
| Lien trop long dans WA | Utiliser `buildShortExpenseUrl` |
