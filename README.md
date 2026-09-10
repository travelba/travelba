# Travel Business Agency

Site vitrine bilingue (FR/EN) pour **Travel Business Agency**, conciergerie de voyage internationale : jet privé, séminaires, événements sur mesure, hôtels, chauffeur, accueil VIP aéroport et voyages d'exception.

Design moderne et dynamique, pensé pour transmettre l'agilité d'une startup tout en gardant un niveau de service haut de gamme.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com)
- [next-intl](https://next-intl.dev) — internationalisation FR / EN
- [Framer Motion](https://www.framer.com/motion/) — animations
- [lucide-react](https://lucide.dev) — icônes
- [Resend](https://resend.com) — envoi des emails du formulaire de contact

## Démarrer en local

```bash
npm install
npm run dev
```

Le site est servi sur `http://localhost:3000` et redirige vers la langue par défaut (`/fr`).

## Back-office agent (`/admin`)

Espace privé pour gérer le flux Little Emperors : dossiers clients, recherche dispo, PDF devis, réservation, suivi paiement hôtel.

1. Renseignez dans `.env.local` : `NEXT_PUBLIC_SUPABASE_*`, `LITTLE_EMPERORS_API_KEY`, et Resend pour les mails hôtel.
2. Créez un utilisateur dans Supabase Auth (email/mot de passe).
3. Ouvrez `http://localhost:3000/admin/login`.

Tables Supabase : `agency_*` (clients, dossiers, quotes, bookings, hotel_contacts, payment_followups). Bucket Storage : `agency-quotes`.

## Configuration

Copiez `.env.example` vers `.env.local` et renseignez les variables :

| Variable | Description |
| -------- | ----------- |
| `RESEND_API_KEY` | Clé API Resend (contact + emails hôtel). |
| `CONTACT_FROM_EMAIL` | Adresse expéditrice vérifiée sur Resend. |
| `CONTACT_TO_EMAIL` | Adresse de réception des demandes. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL projet Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon / publishable Supabase. |
| `LITTLE_EMPERORS_API_URL` | Base API LE (`…/v2`). Staging par défaut. |
| `LITTLE_EMPERORS_API_KEY` | Bearer token LE (serveur uniquement). |
| `LITTLE_EMPERORS_WIDGET_URL` | Base URL du widget carte bancaire. |
| `LITTLE_EMPERORS_WEBHOOK_KEY` | (Optionnel) clé d’auth webhook LE. |

Les informations de contact (email, téléphone, **numéro WhatsApp Business**) et les liens réseaux sociaux se configurent dans [`lib/site.ts`](lib/site.ts).

## Contenus

Tous les textes marketing sont centralisés dans [`messages/fr.json`](messages/fr.json) et [`messages/en.json`](messages/en.json).

## Structure

```
app/
  [locale]/              # site vitrine localisé
  admin/                  # back-office agent
  api/admin/              # API dossiers + proxy Little Emperors
  api/webhooks/           # webhooks LE
components/admin/         # UI back-office
lib/agency/               # types, PDF, templates email
lib/little-emperors/      # client API LE
lib/supabase/             # clients auth SSR
proxy.ts                  # next-intl + protection /admin
```

## Crédits médias

- Photos des prestations : [Unsplash](https://unsplash.com) (licence Unsplash, usage commercial libre).
- Vidéo du header (`public/videos/hero-jet.mp4`) : [Pexels](https://www.pexels.com/video/businesspeople-in-private-jet-5778842/) (licence Pexels, usage commercial libre, sans attribution requise).

Ces médias sont des placeholders de qualité ; ils peuvent être remplacés par vos propres visuels/vidéos.

## Build & déploiement

```bash
npm run build
npm run start
```

Le projet est prêt à être déployé sur [Vercel](https://vercel.com) : importez le dépôt, ajoutez les variables d'environnement, et déployez.
