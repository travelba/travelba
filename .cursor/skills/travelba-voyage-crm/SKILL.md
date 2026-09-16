---
name: travelba-voyage-crm
description: >-
  Master map of Travelba CRM: clients, bookings, ledger, Stripe cards,
  Revolut credits, and the client portal. Use at the start of any Travelba
  admin or /mon-compte task.
---

# Travelba — carte CRM

## Routes

| Besoin | Où |
|--------|-----|
| Accueil client | `/mon-compte` |
| Réservations | `/mon-compte/reservations` |
| Profil / cartes / docs / compagnons | `/mon-compte/profil…` |
| Transactions | `/mon-compte/transactions` |
| Connexion | `/connexion` (mot de passe) |
| Définir mot de passe | `/connexion/mot-de-passe` |
| Back-office | `/admin` |

## Modèle

`crm_customers` → `crm_bookings` / `crm_travel_companions` / `crm_travel_documents` / `crm_transactions` / `crm_payment_methods`

Encours = vue `crm_customer_balances` : positif = avoir, négatif = reste à payer.

## Auth

- Client : invitation back-office (e-mail Resend) → `/auth/callback?token_hash` → définir le mot de passe → session persistante jusqu’à déconnexion
- Flag `app_metadata.must_set_password` (jamais `user_metadata`)
- Staff : mot de passe + ligne `crm_staff`
- Premier agent connecté bootstrap `crm_staff` si table vide
- Données de test : `npm run seed:demo` (clients déjà avec mot de passe, pas de flag)
- Dashboard Supabase (projet `fsmfozxgujskluxakeoq`) :
  - Authentication → Providers : inscriptions publiques **désactivées**
  - Authentication → Sessions : time-box et inactivity timeout **désactivés**
  - URL allowlist : `https://travelba.fr/auth/callback` et `http://localhost:3000/auth/callback`

## Design (Stitch)

Source de vérité UI : projet **Portail Client Agence Voyage**  
`https://stitch.withgoogle.com/projects/10475551423344387411`  
Écrans visibles : **Sovereign Horizon** (marine `#0B192C`, champagne `#C5A880`). Ne pas appliquer Atelier Voyage (émeraude) ni la feuille **Travelba CRM**.

## Fichiers clés

| Rôle | Path |
|------|------|
| Types | `lib/crm/types.ts` |
| Auth staff/client | `lib/crm/auth.ts` |
| Invitation client | `lib/crm/invite.ts` |
| Import documents → résa | `lib/crm/ingest-booking.ts` — skill `.cursor/skills/travelba-document-ingest/SKILL.md` |
| Couverture destination | `lib/crm/cover-generate.ts` + `lib/crm/covers.ts` |
| Identité passeport | `lib/crm/ocr-document.ts` (photo MRZ, pas PDF) |
| Proxy | `proxy.ts` |
| Schema | `supabase/migrations/` |
