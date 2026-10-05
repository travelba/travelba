---
name: travelba-go-live
description: >-
  Perfect Travelba production launch on travelba.fr: Vercel env, domain,
  Resend, Supabase Auth allowlist, Stripe webhook, Revolut production + cron,
  OpenAI ingest, never seed prod, keep staff. Use when deploying, going live,
  configuring production, DNS, webhooks, cron, or "c'est en ligne".
---

# Travelba — lancement production

Cible : **https://travelba.fr** (www → apex, déjà dans `next.config.ts`).
Vercel : projet `prj_NAEfKYyndp7T68G2wKOguSCgtPUr`, team `team_bTvGnpMBL2dVrz8vXQ6vb3eZ`.
Supabase : `fsmfozxgujskluxakeoq`. Ne pas créer un second projet « pour tester la prod ».

Ship = merge `main` → déploiement Vercel Production. Ne pas merger sans demande.

## Ordre (ne pas inverser)

1. Schema + bucket + Auth dashboard (skill `travelba-supabase` + `travelba-auth`)
2. Variables Vercel **Production** (et Preview si les previews doivent envoyer des mails)
3. Domaine + Resend
4. Stripe live + webhook
5. Revolut **production** (pas sandbox) + OAuth + cron
6. `OPENAI_API_KEY` (ingest + couvertures)
7. Smoke **sans** seed, **sans** publier un vrai carnet de client
8. Garder les logins `crm_staff` existants

## Variables (Vercel Production)

Reprendre `.env.example`. Toutes **sauf** `NEXT_PUBLIC_*` sont server-only.

| Variable | Prod |
|----------|------|
| `NEXT_PUBLIC_SITE_URL` | `https://travelba.fr` (sans slash) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL projet `fsmfozxgujskluxakeoq` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — jamais `NEXT_PUBLIC_` |
| `RESEND_API_KEY` | domaine `travelba.fr` vérifié |
| `CONTACT_FROM_EMAIL` | `contact@travelba.fr` (expéditeur vérifié) |
| `CONTACT_TO_EMAIL` | boîte qui reçoit le formulaire vitrine |
| `OPENAI_API_KEY` | `sk-…` — ingest PDF. Sans elle, import cassé en local *et* en prod |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | clé **live** `pk_live_…` |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` de l’endpoint prod |
| `REVOLUT_CLIENT_ID` / `REVOLUT_ISS` | app Business prod |
| `REVOLUT_PRIVATE_KEY` | PEM une ligne, `\n` échappés |
| `REVOLUT_API_URL` | `https://b2b.revolut.com` |
| `REVOLUT_SANDBOX` | `0` |
| `REVOLUT_WEBHOOK_SECRET` | si webhook Revolut activé |
| `CRON_SECRET` | aléatoire long ; Vercel Cron envoie `Authorization: Bearer …` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | compte WhatsApp déjà en Production |
| `TWILIO_CONTENT_CONNEXION` | SID du modèle Utility `connexion_espace`. Hors git. Sans elle, l’invitation reste e-mail seul. `npx tsx scripts/arm-whatsapp-connexion.ts`, puis approbation Meta |
| `TWILIO_CONTENT_SEJOUR` et la série Concierge | SIDs Utility séjour / pièces / passeport / formalité, plus les cartes `TWILIO_CONTENT_PIECE_HOTEL`, `PIECE_VOL`, `PIECE_TRANSFERT`, `PIECES_REGROUPEES`, `PASSEPORT_CARTE`, `PASSEPORTS_CARTE`, `FORMALITE_PRETE_CARTE`, `FORMALITE_MANQUANTE_CARTE`, `CONNEXION_CARTE`, `ENCOURS`, `CHAUFFEUR`, `RAPPEL_DEPART`, `DOCUMENT`. Hors git. Photo du lieu pour le séjour publié, image du sujet pour les autres (`/whatsapp/billet.jpg`, visa, hôtel…). Les variables `*_PHOTO` (`TWILIO_CONTENT_PIECE_HOTEL_PHOTO`, et la même série pour vol, transfert, pièces, passeport, formalité, document) portent cette image. Sans elles, le texte déjà approuvé part. `npx tsx scripts/arm-whatsapp-concierge.ts`, puis approbation Meta. Cron `GET /api/cron/concierge` toutes les 15 min |

Preview : `NEXT_PUBLIC_SITE_URL` d’une preview **ne doit pas** rester `https://travelba.fr` si on envoie des invitations depuis la preview (liens cassés). Les secrets de production sont **Production seulement** : `SUPABASE_SERVICE_ROLE_KEY`, Revolut (`REVOLUT_CLIENT_ID`, `REVOLUT_PRIVATE_KEY`, `REVOLUT_API_URL`, `REVOLUT_SANDBOX`, `REVOLUT_ISS`, `REVOLUT_WEBHOOK_SECRET`), Gmail (`GOOGLE_SA_JSON`, `GMAIL_PUSH_TOKEN`, `GMAIL_IMPERSONATE`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_LABELS`), Pliant (`PLIANT_CLIENT_ID`, `PLIANT_CLIENT_SECRET`), `RESEND_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`. Le code les ignore si `VERCEL_ENV=preview` (`productionOnlySecret`). Resend reste coupé sur Preview. Une preview qui appellerait Auth0 Pliant brûlerait le quota du jour de la production.

OIDC Vercel : `aiGatewayConfigured()` peut être vrai sur Vercel sans `sk-`. L’ingest PDF exige quand même un `OPENAI_API_KEY` `sk-` (`openaiApiKey()`). Ne pas « migrer l’ingest sur le Gateway » tant que la clé OpenAI est là.

## Domaine

- Apex `travelba.fr` + `www.travelba.fr` sur le projet Vercel.
- HTTPS. Redirect www → apex (code + DNS).
- Previews Vercel souvent protégées SSO : un agent utilise l’outil Vercel `get_access_to_vercel_url`, pas un screenshot anonyme.

## Resend

- Domaine `travelba.fr` authentifié (SPF/DKIM).
- From : `TBA <contact@travelba.fr>` (`lib/crm/invite.ts`, `/api/auth/otp`, `/api/contact`).
- Sans `RESEND_API_KEY`, l’invitation **génère quand même un lien** (à copier). En prod la clé est obligatoire.
- Copy e-mail : « Ce lien expire sous 30 jours » — le TTL réel = réglage Supabase Auth (invite). Ne pas inventer un second TTL applicatif.

## Supabase Auth (dashboard prod)

- Site URL : `https://travelba.fr`
- Redirect allowlist : `https://travelba.fr/auth/callback`, `http://localhost:3000/auth/callback`. Ajouter `https://<preview>.vercel.app/auth/callback` seulement si les previews auth sont utilisées.
- Inscriptions publiques **OFF**. Clients = `generateLink` (invite / recovery / magiclink) côté service role.
- Sessions : time-box **et** inactivity timeout **OFF** (session jusqu’à déconnexion ; cookies 400 j).
- Confirm e-mail : géré par nos liens `token_hash`, pas un SMTP Supabase parallèle si Resend envoie déjà.

`proxy.ts` forward `?code=` / `?token_hash=` hors `/auth/callback` vers le handler — au cas où l’allowlist renvoie sur le Site URL.

## Stripe

- Mode **live**. Carte, Apple Pay et prélèvement SEPA (société) passent par PaymentIntent dans **Transactions**. La part particulier a la carte et Apple Pay, sans prélèvement. Pas de PAN. Le virement, ouvert pour les deux parts en euros, est l’IBAN du compte Revolut Business, pas un virement Stripe.
- Endpoint : `https://travelba.fr/api/webhooks/stripe`
- Events : `setup_intent.succeeded`, `payment_method.detached`, `payment_intent.succeeded`
- Pas de page cartes (`/paiement` → facturation). Le règlement est dans Transactions, pas sur la réservation.
- Sans `sk_live` / `pk_live` / `whsec` en Production, le webhook répond **503** et les boutons carte, Apple Pay et prélèvement disent que le moyen n’est pas ouvert. Le virement dépend de Revolut, pas de ces clés. Ne pas inventer les clés. Le grand livre manuel fonctionne.
- Ne jamais logger le PaymentMethod brut au-delà de `brand` / `last4` / exp.

## Revolut

- **Pas** `REVOLUT_SANDBOX=1` en prod.
- Relier l’app via `/admin/revolut` (OAuth, tokens dans `crm_integrations`, service_role only).
- Cron Vercel : `vercel.json` → `GET /api/cron/revolut-sync` toutes les 15 min. Header `Authorization: Bearer $CRON_SECRET`.
- Pliant : `GET /api/cron/pliant-sync` toutes les 15 min ne redemande pas de jeton. Auth0 est limité à une poignée par jour. Le jeton vit dans `crm_integrations` (provider `pliant`) et le verrou `crm_claim_integration_refresh`. Skill `travelba-visa`.
- Inbox `crm_revolut_transactions` status `unmatched` → auto-crédit si match unique certain (`revolut-match`) ; sinon l’agent rapproche ou ignore (inbox + fiche client).
- L’espace client affiche l’IBAN SEPA du compte euros actif nommé Main (`GET /api/1.0/accounts` puis bank-details). Une poche n’est pas proposée. Le client indique son nom en référence. Ne pas journaliser l’IBAN.
- Webhook `/api/webhooks/revolut` si l’app Revolut le pointe ; le cron reste la source de rattrapage.

## Fichiers / OpenAI

- Bucket `crm-files` **privé**.
- Ingest : `unpdf` + `gpt-4o`. Plafond 30 fichiers / 25 Mo.
- Couverture : photo de la ville, sinon photo vérifiée du pays (`lib/crm/cover-catalog.ts`). Jamais Paris/CDG comme destination. Pas de génération automatique. Import agence : `bookings/{id}/cover.webp`. Skill `travelba-carnet`.

## Interdits prod

- `npm run seed:demo`
- Appliquer ou ré-appliquer `supabase/migrations/20260915154500_crm_demo_client_aura.sql` comme « reset »
- DELETE sur `crm_staff` / `auth.users` staff
- Recréer Marie Dupont / TBA-DEMO
- Pointer `REVOLUT_API_URL` sandbox
- Clés Stripe `sk_test` / `pk_test` sur l’env Production
- Déployer sans `CRON_SECRET` (le cron refuse toute requête sans Bearer). Ne pas retomber sur `x-vercel-cron-schedule` (spoofable).
- Imprimer PII dans les logs Vercel (passeport, MRZ, e-mail client en clair dans un `console.info` d’invite : déjà le lien en local seulement)

## Smoke prod (après deploy)

1. `https://travelba.fr/admin/login` → staff existant entre.
2. `/admin/clients` liste les vrais clients (pas un seed).
3. `/connexion` mot de passe + magique (Regarder Resend, pas les logs pour le lien).
4. Un carnet **déjà publié** s’affiche ; un brouillon reste invisible. **S’il n’y a aucun séjour publié, ne pas en inventer** — skip ce check. L’agent importe un vrai dossier, Enregistrer, puis Publier. `/admin` affiche alors « Mise en service ».
5. `/admin/revolut` : **Connecter Revolut** (SCA Business) si `crm_integrations` est vide. Ensuite le cron remplit l’inbox et auto-crédite les matches uniques certains. Inbox vide tant que l’OAuth n’est pas fait = normal.
6. Contact vitrine → e-mail `CONTACT_TO_EMAIL`.
7. WhatsApp header client → `wa.me/33756841315`.

Smoke **loggé** staff → ingest → publier, et client → téléphone → carnet : à faire par l’agence sur un vrai dossier. Pas de mot de passe staff dans un agent.

Si un check échoue : skill `travelba-verify`, logs Vercel runtime, **pas** un seed.
