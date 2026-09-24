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
| Après login | `/admin` | mot de passe à définir → profil, sinon `/mon-compte` |

Compagnons = **fiche seulement**, pas de compte Auth. Pas d’auto-signup : `ensureCustomerForUser` **lie** un user à un customer existant par email, ne crée pas de fiche.

## Créer ≠ Inviter

- `POST /api/admin/clients` **sans** `invite` → insert `crm_customers` uniquement (`NewCustomerForm` bouton **Créer**).
- Invitation : `InviteCustomerPanel` → `POST /api/admin/clients/[id]/invite` → `inviteCustomer()`.
- Copier le lien toujours disponible après génération (Resend down / local).

`generateLink({ type: "invite" })` ; si déjà inscrit → `type: "recovery"`. URL courte `/e/CODE` (jeton en `crm_entry_links`), puis mot de passe.

Copy « 30 jours » ; TTL réel = Supabase Auth. Ne pas stocker le lien en base.

WhatsApp Le Concierge : même lien, en plus de l’e-mail. Modèle Utility `TWILIO_CONTENT_CONNEXION` (`connexion_espace`) : {{1}} prénom, bouton « Ouvrir mon espace » = `https://travelba.fr/e/{{2}}`. Sans ce SID, l’e-mail part quand même. Ne pas réutiliser `TWILIO_WHATSAPP_CONTENT_SID`. Création : `npx tsx scripts/arm-whatsapp-connexion.ts` — le SID reste hors git. Meta doit approuver avant le premier envoi.

Après succès mot de passe (`/api/client/password`) : `app_metadata.must_set_password=false` + `refreshSession`. Redirection : **`/mon-compte/profil`** seulement si `crm_customers.phone` est vide, sinon **`/mon-compte`**. Le mur téléphone reste le filet si l’accueil est ouvert sans numéro.

## Flag mot de passe

`must_set_password` **uniquement** dans `app_metadata` (jamais `user_metadata`, éditable par le user). Helper `mustSetPassword()` dans `lib/crm/session.ts`.

`proxy.ts` : user client avec le flag → `/connexion/mot-de-passe`. Staff sur `/connexion` → `/admin`.

## Login client

`/connexion` : mot de passe **et** lien magique (`POST /api/auth/otp` → `generateLink` magiclink + Resend). Mot de passe oublié = `resetPasswordForEmail` → callback → définir mot de passe.

OTP : si l’e-mail n’est pas un client déjà invité (`crm_customers.auth_user_id`), répondre `{ ok: true }` sans `generateLink` (pas d’énumération, pas de création Auth).

Mot de passe oublié : `POST /api/auth/reset` (même garde titulaire, `generateLink` recovery + `must_set_password`, Resend). Pas `resetPasswordForEmail` client (PKCE sans `type=recovery`).

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
- Suppression client (`deleteCustomerById`) : ne **pas** `auth.admin.deleteUser` si le même `auth_user_id` est staff.

## Client : pas de self-delete

Pas de bouton « supprimer mon compte ». L’agence peut supprimer une fiche admin (dossiers + fichiers + txs + user Auth si non staff).

## Fichiers

`lib/crm/invite.ts`, `lib/crm/whatsapp.ts`, `lib/crm/auth.ts`, `lib/crm/session.ts`, `lib/supabase/middleware.ts`, `app/auth/callback/route.ts`, `app/api/auth/otp/route.ts`, `app/api/client/password/route.ts`, `proxy.ts`.
