# Travel Business Agency

Site vitrine bilingue (FR/EN) + CRM agence (back-office `/admin`, espace client `/mon-compte`).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + next-intl
- Supabase (Auth, Postgres, Storage)
- Stripe (cartes enregistrées) + Revolut Business (virements)

## Démarrer

```bash
npm install
# Copier .env.example → .env.local
# Appliquer supabase/migrations/20260915093000_crm_schema.sql sur le projet fsmfozxgujskluxakeoq
npm run dev
```

## Auth

- Agents : `/admin/login` (email + mot de passe). Le premier utilisateur devient `crm_staff` admin.
- Clients : `/connexion` (lien magique email) → `/mon-compte`.

## Encours

Vue `crm_customer_balances` = crédits − débits `posted`. Positif = avoir, négatif = reste à payer.
