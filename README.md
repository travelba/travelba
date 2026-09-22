# Travel Business Agency

Site vitrine bilingue (FR/EN) + CRM agence (back-office `/admin`, espace client `/mon-compte`).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + next-intl
- Supabase (Auth, Postgres, Storage)
- Stripe (cartes enregistrées) + Revolut Business (virements)

## Démarrer

Agents : `.cursor/skills/travelba-voyage-crm/SKILL.md` (index) → `travelba-bootstrap` en local, `travelba-go-live` pour `https://travelba.fr`.

```bash
npm install --include=optional
# Copier .env.example → .env.local (jamais commit)
# Appliquer supabase/migrations/ dans l’ordre — sauf le seed démo en production
npm run dev
```

## Auth

- Agents : `/admin/login` (email + mot de passe). Le premier utilisateur devient `crm_staff` admin si la table est vide — ne pas vider la table en prod.
- Clients : `/connexion` (mot de passe **et** lien magique) après **Inviter** (Créer ≠ Inviter). Premier mot de passe → profil.
- `npm run seed:demo` : base locale / jetable uniquement, jamais `travelba.fr`.

## Encours

Vue `crm_customer_balances` = crédits − débits `posted`. Positif = avoir, négatif = reste à payer.
