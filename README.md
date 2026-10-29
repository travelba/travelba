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
npm ci --include=optional   # versions du lockfile ; `npm install <paquet>` pour en ajouter une, lockfile commité
# Copier .env.example → .env.local (jamais commit)
# Appliquer supabase/migrations/ dans l’ordre — sauf le seed démo en production
npm run dev
```

## Auth

- Agents : `/admin/login` (email + mot de passe). Le premier utilisateur devient `crm_staff` admin si la table est vide — ne pas vider la table en prod.
- Clients : `/connexion` (mot de passe **et** lien magique) après **Inviter** (Créer ≠ Inviter). Premier mot de passe → profil.
- `npm run seed:demo` : base locale / jetable uniquement, jamais `travelba.fr`.

## Restaurants

Le CRM crée la proposition et enregistre le choix. WhatsApp affiche la fiche ; le clic (webhook Twilio) met à jour la table.

Migrations à jouer à la main, dans l’ordre :

1. `supabase/migrations/20261029120000_crm_restaurants.sql`
2. `supabase/migrations/20261029203000_crm_restaurant_catalogue.sql`

À 16 h, heure locale : un pré-message, puis un carrousel par restaurant. Les couverts sont fixés à 2. À 18 h, la table non choisie passe à annuler. Accepter l’une passe l’autre à annuler tout de suite.

Variables, vides tant que Meta n’a pas approuvé :

- `TWILIO_CONTENT_RESTAURANT_INTRO` — texte `restaurant_selection`
- `TWILIO_CONTENT_RESTAURANT_PROPOSITION` — carrousel salle + plat
- `TWILIO_CONTENT_RESTAURANT_PROPOSITION_CARTE` — les deux, plus la carte

`npx tsx scripts/create-restaurant-whatsapp-templates.ts` affiche les modèles. `--create` les dépose chez Twilio et demande l’approbation Utility, sans envoyer de message. Soumettre après le déploiement : l’exemple photo est `https://travelba.fr/api/restaurants/media/exemple.salle`.

Meta n’autorise que deux boutons par carte, de mêmes types. « J’accepte » et « Je refuse » occupent ces deux places. « Découvrir l’adresse » est le lien `https://travelba.fr/api/r/{id}` dans la carte salle, pas un troisième bouton. L’heure de 18 h est dans le pré-message seulement.

## Encours

Vue `crm_customer_balances` = crédits − débits `posted`. Positif = avoir, négatif = reste à payer.
