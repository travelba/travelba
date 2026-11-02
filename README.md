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
3. `supabase/migrations/20261029330000_crm_restaurant_fiche.sql` (cuisine, style, horaires, estimation, annulation en ligne, disponibilités, statut `a_valider`)

Fuseau du séjour : toujours celui de la ville où l’on dort (Nice → `Europe/Paris`, Mahé → `Indian/Mahe`), résolu hors ligne par `lib/crm/stay-timezone.ts` (ville de la carte hôtel, puis la carte, puis la destination, puis le pays). Le champ `crm_bookings.timezone` ne sert que si la ville ne se résout pas.

À 16 h, heure locale : un pré-message, puis un carrousel par restaurant. Les couverts sont fixés à 2. À 18 h, la table non choisie passe à annuler. Accepter l’une passe l’autre à annuler tout de suite.

Variables, facultatives : sans elles, le cron retrouve chez Twilio le modèle approuvé qui porte le nom (`restaurant_selection`, `restaurant_proposition`, `restaurant_proposition_carte`).

- `TWILIO_CONTENT_RESTAURANT_INTRO` — texte `restaurant_selection`
- `TWILIO_CONTENT_RESTAURANT_PROPOSITION` — carrousel salle + plat
- `TWILIO_CONTENT_RESTAURANT_PROPOSITION_CARTE` — les deux, plus la carte

Liste d’essai : `RESTAURANT_ALLOWED_BOOKINGS` (références séparées par des virgules, ex. `TB-2026-0075`). Fermé par défaut : sans la variable, aucun WhatsApp restaurant ne part (pré-message, cartes, clôture, confirmation), ni par le cron, ni par Envoyer au client, ni par les clics du client. L’écran Restaurants du soir montre « Hors liste d’essai » et éteint l’envoi. Le mode test de Benjamin écrit au numéro de test seulement.

Après « J’accepte » (bouton WhatsApp ou Accepter dans l’espace client), le CRM envoie la confirmation en message libre dans la fenêtre de 24 h : restaurant, date, heure, deux personnes, lien de l’adresse. Une seule confirmation par table (`dedupe_key`), journalisée dans le dossier (`crm_whatsapp_messages`, `restaurant_confirmation`).

Dépôt des modèles depuis le serveur, avec les identifiants Twilio de production : outil MCP `create_restaurant_whatsapp_templates` (crée les trois contenus, soumet chacun en Utility, idempotent par nom, n’envoie aucun message, ne renvoie aucun secret) puis `get_restaurant_whatsapp_templates_status` (statut d’approbation par modèle). `npx tsx scripts/create-restaurant-whatsapp-templates.ts` affiche les modèles ; `--create` fait la même chose depuis un poste. Soumettre après le déploiement : l’exemple photo est `https://travelba.fr/api/restaurants/media/exemple.salle`.

Connecteur, catalogue : `list_restaurants` (par ville, pour éviter un doublon), `create_restaurant` (nom et ville ; statut `a_valider` par défaut, hors sélection tant que l’agence ne l’active pas), `update_restaurant` (`restaurant_id`). Chaque réponse porte `fiche_complete` et `champs_manquants`. Les soirs d’un dossier : `sejours_restaurants`, `tables_restaurant` (table A ou B), `choix_restaurant`.

Meta n’autorise que deux boutons par carte, de mêmes types. « J’accepte » et « Je refuse » occupent ces deux places. « Découvrir l’adresse » est le lien `https://travelba.fr/api/r/{id}` dans la carte salle, pas un troisième bouton. L’heure de 18 h est dans le pré-message seulement.

## Encours

Vue `crm_customer_balances` = crédits − débits `posted`. Positif = avoir, négatif = reste à payer.
