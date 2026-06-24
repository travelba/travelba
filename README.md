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

## Configuration

Copiez `.env.example` vers `.env.local` et renseignez les variables :

| Variable             | Description                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `RESEND_API_KEY`     | Clé API Resend. Sans elle, les demandes sont seulement loggées.          |
| `CONTACT_FROM_EMAIL` | Adresse expéditrice vérifiée sur Resend.                                 |
| `CONTACT_TO_EMAIL`   | Adresse de réception des demandes.                                       |

Les informations de contact (email, téléphone, **numéro WhatsApp Business**) et les liens réseaux sociaux se configurent dans [`lib/site.ts`](lib/site.ts).

> Pensez à remplacer le numéro WhatsApp placeholder (`33600000000`) par le vrai numéro.

## Contenus

Tous les textes sont centralisés dans [`messages/fr.json`](messages/fr.json) et [`messages/en.json`](messages/en.json).

## Structure

```
app/
  [locale]/        # layout + page d'accueil localisés
  api/contact/     # endpoint d'envoi d'email (Resend)
components/        # Header, Hero, Services, WhyUs, Process, Testimonials, Contact, Footer, ...
i18n/              # configuration next-intl (routing, navigation, request)
lib/site.ts        # constantes du site (contact, WhatsApp, services)
messages/          # traductions FR / EN
proxy.ts           # middleware next-intl (routage des locales)
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
