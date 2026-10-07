---
name: travelba-auth
description: >-
  Travelba auth: staff vs client, Créer ≠ Inviter, magic link + password,
  must_set_password in app_metadata, 400-day cookies, phone wall, holder-only
  login. Use when touching /connexion, invite, otp, crm_staff, sessions,
  or portal access.
---

# Travelba — auth

Deux mondes, un Supabase Auth.

| | Staff | Client (titulaire) |
|--|-------|---------------------|
| Entrée | `/admin/login` | `/connexion` |
| Preuve | ligne `crm_staff` | ligne `crm_customers.auth_user_id` |
| Rôle JWT | `app_metadata.crm_role` = `admin` \| `agent` | `crm_role=client` |
| Après login | `/admin` | mot de passe à définir → bienvenue (une fois) → profil si pas de téléphone, sinon `/mon-compte` |

Compagnons = **fiche seulement**, pas de compte Auth. Pas d’auto-signup : `ensureCustomerForUser` **lie** un user à un customer existant par email, ne crée pas de fiche.

## Créer ≠ Inviter

- `POST /api/admin/clients` **sans** `invite` → insert `crm_customers` uniquement (`NewCustomerForm` bouton **Créer**).
- Invitation : `InviteCustomerPanel` → `POST /api/admin/clients/[id]/invite` → `inviteCustomer()`.
- Copier le lien toujours disponible après génération (Resend down / local).

`generateLink({ type: "invite" })` ; si déjà inscrit → `type: "recovery"`. URL courte `/e/CODE` (jeton en `crm_entry_links`), puis mot de passe.

Copy « 30 jours » = `expires_at` du lien court (le jeton Supabase, plus court, est régénéré jusque-là, cinq ouvertures au plus). Ne pas stocker le lien en base.

WhatsApp Le Concierge : même lien, en plus de l’e-mail. Modèle Utility `TWILIO_CONTENT_CONNEXION` (`connexion_espace`) : {{1}} prénom, bouton « Ouvrir mon espace » = `https://travelba.fr/e/{{2}}`. {{2}} vaut `c/` + le code, donc l’adresse prévisualisée est `https://travelba.fr/e/c/CODE` (autre carte que `/e/CODE`). Le GET sans query sert toujours l’aperçu (titre, description, favicon, photo seulement si le lien est « Votre séjour »). Le script remplace l’adresse par la même avec `?ouvrir=1` : le navigateur intégré de WhatsApp bloque l’envoi automatique d’un formulaire, pas cette navigation. Un appui (`Sec-Fetch-User`) ouvre aussi au GET. Le robot `WhatsApp/…` ne l’exécute pas et n’est jamais redirigé, donc il ne consomme pas le jeton. Ce GET, comme le POST du bouton, vérifie le jeton, pose la session et ouvre `next`. Le lien court expire (`crm_entry_links.expires_at` : 24 h magique, 30 j invitation / réinitialisation) et peut être révoqué (`revoked_at`) : au-delà, l’aperçu dit « Ce lien ne s’ouvre plus », sans bouton, avec un lien « Se connecter » vers `/connexion`. Un navigateur qui a déjà une session passe sans consommer le jeton (sauf lien révoqué). Sinon, dans le délai du lien, le jeton Supabase consommé (aperçu, scanner d’e-mail) est régénéré pour l’e-mail enregistré, cinq ouvertures au plus (`open_count`, `MAX_ENTRY_OPENS`, décision pure `entryReopenDecision`) ; la première pose `used_at`, chacune est journalisée (`crm_customer_logins`, `entry`). `channel` (`email` | `whatsapp`) dit par où le lien est parti : ouvrir un lien WhatsApp pose `whatsapp_opt_in_at` si vide (preuve que le client a reçu le message) — l’opt-in ne vient jamais d’une requête anonyme. La photo de l’aperçu est `/api/covers/sejour/REF?e=CODE` (le code du lien lui-même, vérifié vivant et « Votre séjour ») : jamais le code de partage `/v/`, qu’un GET anonyme ne crée pas. Un lien transféré ou copié ne reste donc pas un mot de passe à vie. Un lien valable ne renvoie jamais vers `/connexion`. Sans ce SID, l’e-mail part quand même. Ne pas réutiliser `TWILIO_WHATSAPP_CONTENT_SID`. Création : `npx tsx scripts/arm-whatsapp-connexion.ts` — le SID reste hors git. Meta doit approuver avant le premier envoi. Les messages de séjour, pièces et formalité sont une autre série (`scripts/arm-whatsapp-concierge.ts`) : sans leur SID, rien n’est envoyé. L’image suit le sujet (hôtel, billet, visa, passeport). Seul `sejour_publie` porte la photo du lieu. Le modèle `*_photo` part s’il est approuvé ; sinon le texte déjà approuvé part.

Après succès mot de passe (`/api/client/password`) : `app_metadata.must_set_password=false` + `refreshSession`. Un collègue (`crm_staff`) va sur **`/admin`**, sans bienvenue. Pour un client, si `client_onboarding_done` n’est pas déjà vrai, poser `client_onboarding_pending` (app_metadata seulement) et ouvrir **`/mon-compte/bienvenue`**. Passer ou terminer (`POST /api/client/onboarding`) pose `client_onboarding_done` et retire le pending. Ensuite : **`/mon-compte/profil`** seulement si `crm_customers.phone` est vide, sinon **`/mon-compte`**. Une seule fois, y compris après un mot de passe oublié. Le mur téléphone reste le filet si l’accueil est ouvert sans numéro. La bienvenue ne montre pas les brouillons ni les cartes. Le WhatsApp d’accès part dans le même geste, sans bloquer l’enregistrement. S’il existe déjà un `connexion` envoyé depuis moins de 24 h, ce geste ne renvoie pas le même texte. Le bouton de renvoi sur la fiche, lui, envoie quand même.

Client seulement (pas le collègue) : ce même geste envoie WhatsApp Le Concierge, lien magique vers l’espace (`magiclink`, pas `recovery`), sauf doublon des dernières 24 h. Le lien ne contient pas le mot de passe et n’ouvre pas la création de mot de passe. L’invitation, elle, continue d’ouvrir la création et d’envoyer le premier message.

## Flag mot de passe

`must_set_password` **uniquement** dans `app_metadata` (jamais `user_metadata`, éditable par le user). Helper `mustSetPassword()` dans `lib/crm/session.ts`.

`proxy.ts` : user client avec le flag → `/connexion/mot-de-passe`. Staff sur `/connexion` → `/admin`.

## Login client

`/connexion` : mot de passe **et** lien magique (`POST /api/auth/otp` → `generateLink` magiclink + Resend). Mot de passe oublié = `resetPasswordForEmail` → callback → définir mot de passe.

OTP : si l’e-mail n’est pas un client déjà invité (`crm_customers.auth_user_id`), répondre `{ ok: true }` sans `generateLink` (pas d’énumération, pas de création Auth).

Mot de passe oublié : `POST /api/auth/reset` (même garde titulaire, `generateLink` recovery + `must_set_password`, Resend). Pas `resetPasswordForEmail` client (PKCE sans `type=recovery`).

Le formulaire mot de passe n’accepte que le mot de passe du client (`signInWithPassword` côté navigateur). **Aucun code maître** : `ADMIN_CLIENT_CODE` et `/api/auth/login` ont été supprimés (B-06) — ne pas les recréer.

Chaque connexion reste dans `crm_customer_logins`. Ce que le titulaire fait ensuite est dans `crm_customer_activity` (fiche › Activité) : page ouverte, fiche, pièce, voyageur, règlement, carte, formalité, service, partage, calendrier, déconnexion. Le libellé est en français et ne contient ni mot de passe, ni numéro de pièce, ni PAN. Quand le geste concerne un séjour, il porte son nom (titre choisi, sinon destination) et sa référence. La même page revue dans les 90 secondes ne s’écrit qu’une fois. Une ouverture par l’agence (`tb_desk`) n’écrit pas dans ce journal.

## Ouvrir l’espace d’un client (agence)

Fiche client › « Ouvrir l’espace client » → `POST /api/admin/clients/[id]/ouvrir` (`requireStaff`, 30 par heure et par agent via `crm_rate_limit_hit`). `lib/crm/desk-open.ts` :
- jamais pour un compte de l’agence (`crm_staff` ou rôle Auth staff), ni à la création ni à l’ouverture ;
- fiche sans compte : compte Auth confirmé, sans mot de passe ni message (`linkCustomerAuth`) ; un e-mail déjà pris par un agent ne se rattache jamais ;
- lien court `channel = 'desk'`, `created_by_staff_id`, **10 minutes, une ouverture, jamais régénéré** (`DESK_LINK_TTL_MS`, `deskOpenDecision`). Pas de repli sans colonnes : un lien desk sans date deviendrait un lien de 30 jours.

À l’ouverture (`openDeskEntry` dans `entry-open.ts`) : une autre session déjà ouverte dans ce navigateur (souvent l’agent) n’est **jamais écrasée** — page « Une session est déjà ouverte ici », lien intact pour une fenêtre privée ou le téléphone du client. Sinon session client, cookie `tb_desk` 4 h (saute mot de passe à définir et mur téléphone, clé HMAC dérivée de la clé de service), ligne `crm_customer_logins` `desk` avec `staff_id`, jamais fusionnée par l’anti-doublon de 90 s. Bandeau « Espace ouvert par l’agence » + « Fermer l’espace » dans `AccountChrome` : la session Supabase dure 400 jours, la fermer sur un poste partagé.

## Sessions

- Cookies `AUTH_COOKIE_OPTIONS` : `maxAge` 400 jours, `sameSite=lax`, `path=/`.
- Dashboard Auth : time-box + inactivity **désactivés**.
- Déconnexion explicite seulement. Pas de « rester connecté » checkbox (c’est déjà le cas).

## Mur téléphone

`AccountChrome` : si `!customer.phone` et path **hors** `/mon-compte/profil*`, on n’affiche pas le carnet — CTA profil. Le titulaire peut éditer le téléphone sur Vous.

## Staff

- `requireStaff` / `requireStaffPage`. Premier user si table vide → admin.
- Ajouter un agent = Auth user + insert `crm_staff`. Ne pas recycler un client.
- `ensureStaff` d’un client déjà en `crm_customers` ne doit **pas** le promouvoir.
- **Une fiche client ne porte jamais l’e-mail ni le user Auth d’un compte de l’agence** (incident 07/10 : fiche sur l’e-mail d’un admin → l’invitation WhatsApp a ouvert `/admin`). `lib/crm/client-account.ts` : `clientLinkToken()` génère **tout** jeton client (invitation, lien magique, Concierge, carte, formalité, vol) et refuse un compte agence (`isStaffAccount` : ligne `crm_staff` ou `crm_role` admin/agent) ; `staffEmailBlock()` (RPC `crm_is_staff_email`) refuse l’e-mail à la création et au changement d’e-mail ; `ensureCustomerForUser` ne rattache ni ne rend une fiche à un staff ; `openEntry` referme la session si un lien client (`next_path` hors `/admin`) a ouvert un compte agence (`entryStaffDecision`). Migration `staff_customer_overlap` : triggers des deux côtés. Ne pas appeler `generateLink` directement pour un client.
- Suppression client (`deleteCustomerById`) : ne **pas** `auth.admin.deleteUser` si le même `auth_user_id` est staff.

## Client : pas de self-delete

Pas de bouton « supprimer mon compte ». L’agence peut supprimer une fiche admin (dossiers + fichiers + txs + user Auth si non staff).

## Fichiers

`lib/crm/invite.ts`, `lib/crm/whatsapp.ts`, `lib/crm/auth.ts`, `lib/crm/session.ts`, `lib/supabase/middleware.ts`, `app/auth/callback/route.ts`, `app/api/auth/otp/route.ts`, `app/api/client/password/route.ts`, `proxy.ts`.
