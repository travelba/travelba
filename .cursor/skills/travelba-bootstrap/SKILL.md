---
name: travelba-bootstrap
description: >-
  Boot a Travelba clone to a working local CRM: Next.js 16 App Router, env,
  Supabase migrations, first staff, folder conventions, proxy.ts. Use when
  creating the project, onboarding a new agent, scaffolding a feature, or
  asking "how do I start Travelba". Do not use create-next-app from scratch.
---

# Travelba — créer / démarrer le projet

Le dépôt **existe** : `github.com/travelba/travelba`. Ne pas `create-next-app`.
Cloner, configurer, shipper des flux CRM. Lire `node_modules/next/dist/docs/`
avant toute API Next.js nouvelle (v16.2 casse le training data).

## Stack figée

| Pièce | Choix |
|-------|--------|
| App | Next.js 16 App Router + React 19 + TypeScript, Turbopack |
| CSS | Tailwind v4 — tokens dans `app/globals.css` (`--admin-navy`, `--admin-gold`) |
| i18n vitrine | `next-intl` (`app/[locale]/`). CRM = **FR only** |
| Auth / DB / files | Supabase projet `fsmfozxgujskluxakeoq` |
| Edge | `proxy.ts` (pas `middleware.ts`) |
| Icons | Lucide via `components/crm/icons.tsx` |
| Fonts | Plus Jakarta + Inter preload ; Space Grotesk `preload: false` |
| Images CRM | `<CoverPhoto>` = `<img>` natif, pas `next/image` |

**Interdit** : `cacheComponents` / PPR expérimental. `serverExternalPackages`: `sharp`, `unpdf`.

Install (sharp optionnel Linux) :

```bash
npm install --include=optional
cp .env.example .env.local   # remplir, jamais commit
npm run dev                  # http://localhost:3000
```

`vercel.json` impose `installCommand: npm install --include=optional`.

## Arborescence à respecter

```
app/admin/**          back-office (robots noindex)
app/mon-compte/**     espace client
app/connexion/**      login client
app/auth/callback     token_hash + PKCE code
app/api/admin/**      requireStaff
app/api/client/**     requireCustomer
app/api/files         signed URL 600s
app/[locale]/**       vitrine FR/EN seulement
lib/crm/**            domaine
lib/supabase/**       server / client / admin / cookies
components/admin|account|crm
supabase/migrations/  SQL versionné, jamais SQL ad hoc en prod
proxy.ts              session + intl
```

Nouvelle page CRM : `loading.tsx` sibling. Nouvelle API : `runtime = "nodejs"` si fichiers / Stripe / Revolut / OpenAI.

## Premier lancement local

1. Copier `.env.example` → `.env.local`. Minimum : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
2. Appliquer les migrations **sauf** le seed démo — skill `travelba-supabase`.
3. Créer le bucket privé `crm-files`.
4. Auth dashboard : skill `travelba-auth` / `travelba-go-live`.
5. Ouvrir `/admin/login` avec un compte Auth. Si `crm_staff` est **vide**, `ensureStaff` insère le premier utilisateur en `admin`. **Ne jamais vider `crm_staff` en prod.**
6. Créer un client (bouton **Créer**, sans inviter) → fiche → **Envoyer l’invitation** si besoin.

`npm run seed:demo` : **uniquement** base locale / projet jetable. Identifiants console. Jamais contre `travelba.fr` ni le projet prod.

## Conventions code

- UI / copy client **français**. Vocabulaire : **l’agence** (pas « votre conseiller »), **carnet**, **Enregistrer** ≠ **Publier**.
- Mutations CRM via Route Handlers, pas Server Actions magiques.
- Client browser : `@/lib/supabase/client`. Serveur : `@/lib/supabase/server`. Service role : `@/lib/supabase/admin` (`server-only`).
- Cookies session : `AUTH_COOKIE_OPTIONS` (`maxAge` 400 jours).
- IDs booking : RPC `crm_next_booking_reference` → `TB-YYYY-0001`.
- Feature carnet / argent / identité : charger le skill dédié, ne pas improviser le modèle.
- Une remarque produit tranchée (photo, passeport, copy, nav) se note dans le skill du domaine, pas seulement dans le code.
- Tests : `npm test` (`npx tsx --test lib/crm/*.test.ts`).

## Nouvelle feature — checklist

1. Table déjà là ? Lire `lib/crm/types.ts` + dernière migration.
2. RLS staff `crm_private.is_staff()` + self `crm_private.customer_id()`.
3. Fichiers → `uploadCrmFile` + `/api/files`, jamais signed URL dans le JSX.
4. Copy FR + `loading.tsx` + tests `node --test` à côté du module (`lib/crm/*.test.ts`).
5. Vérifier admin **et** `/mon-compte` si l’état est partagé (fiche, carnet).

## Ce qu’il ne faut pas reconstruire

Stripe Checkout, un second Auth, Material Icons, un bucket public, un ingest côté client, un PDF relevé auto, une cloche de notif, un champ WhatsApp client, Cache Components.
