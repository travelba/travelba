# Inscription des clients

Le Travel Club TBA est accessible sur invitation uniquement. Sans lien, `/inscription` n’affiche que cette phrase et un lien vers la connexion. Une demande se dépose depuis `/inscription/i/{jeton}`, après une invitation de l’agence ou d’un membre. L’espace reste fermé tant qu’un administrateur n’a pas validé. La validation réutilise l’invitation déjà en place (e-mail, puis WhatsApp Twilio si le message part).

Migrations à jouer à la main, dans l’ordre, sans reset :

1. `supabase/migrations/20261123210000_signup_requests.sql`
2. `supabase/migrations/20261123220000_travel_club_referrals.sql`
3. `supabase/migrations/20261123233000_club_platinum.sql`
4. `supabase/migrations/20261124140000_club_new_year.sql`

## Variables

| Variable | Rôle |
| --- | --- |
| `SIGNUP_SMS_ENABLED` | `1` pour exiger un code SMS. Absent : le téléphone est demandé, pas vérifié. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` | Envoi du code. Sans les trois, le flag ne bloque pas la demande. |
| `SIGNUP_LINK_SECRET` | Signature des liens d’invitation. Vide : dérivé de `CRON_SECRET` ou de la clé service. |
| `WHATSAPP_TOKEN` | Jeton permanent Meta (WhatsApp Business Cloud). |
| `WHATSAPP_PHONE_NUMBER_ID` | Numéro expéditeur. |
| `WHATSAPP_TEMPLATE_INVITATION` | Modèle d’invitation de l’agence. Proposition : `invitation_inscription`. |
| `WHATSAPP_TEMPLATE_PARRAINAGE` | Modèle de parrainage. Proposition : `invitation_parrainage`. |
| `WHATSAPP_TEMPLATE_LANG` | `fr`. |
| `WHATSAPP_GRAPH_VERSION` | `v21.0` si vide. |

Sans `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` et `WHATSAPP_TEMPLATE_INVITATION`, l’admin reçoit un lien `wa.me` à partager. Rien n’est envoyé à Meta.

Les e-mails passent par Resend (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`), comme le reste du CRM. `CONTACT_TO_EMAIL` est ajouté aux administrateurs prévenus d’une nouvelle demande.

## Modèles WhatsApp à faire approuver

Catégorie Utility, langue `fr`. Bouton « Rejoindre le club », adresse `https://travelba.fr/inscription/i/{{1}}` (le jeton seulement). Le domaine `travelba.fr` doit être autorisé.

`invitation_inscription` — catégorie Meta probable : **Utility** (lien personnel d’ouverture de compte, à usage unique). L’offre d’adhésion peut faire pencher Meta vers Marketing.

Bonjour {{1}}, le Travel Club TBA a le plaisir de vous offrir l’adhésion Platinum jusqu’au 31 décembre 2026. Cette adhésion est nominative et réservée à vos propres réservations. Ce lien personnel expire le {{2}}.

{{1}} prénom, {{2}} date.

`invitation_parrainage` — catégorie Meta probable : **Marketing** (recommandation et offre d’adhésion ; le destinataire n’a pas demandé le message).

Bonjour {{1}}, {{2}} vous a recommandé au Travel Club TBA, qui a le plaisir de vous offrir l’adhésion Platinum jusqu’au 31 décembre 2026. Cette adhésion est nominative et réservée à vos propres réservations. Ce lien personnel expire le {{3}}.

{{1}} prénom du proche, {{2}} prénom du parrain, {{3}} date.

## Parcours

Sans jeton, `/inscription` affiche « Le Travel Club TBA est accessible sur invitation uniquement. » et un lien vers la connexion.

Avec un jeton valable, deux écrans :

1. La carte du club déjà utilisée dans Hôtels (`HotelClubSheet`, sans les prix), la phrase Platinum, le prénom, le nom, l’e-mail et le téléphone repris de l’invitation (le téléphone identifie le lien), puis la date de naissance.
2. Les deux cases (conditions, confidentialité) et le bouton « Déposer ma demande ».

Les préférences de voyage ne sont pas dans ce parcours. L’origine est l’invitation : agence ou parrainage. Après le dépôt, Benjamin valide à la main.

## Fin d’adhésion et 1er janvier

La validation pose `club_ends_on` au 31 décembre 2026 (`CLUB_OFFER_ENDS_ON`). L’invitation et l’écran Hôtels affichent « Jusqu’au 31 déc. 2026 », ou la date stockée si elle diffère. Le 1er janvier 2027 à 0 h 30, heure de Paris, `GET /api/cron/club-new-year` (`30 23 31 12 *`, soit 23 h 30 UTC le 31 décembre) peut passer cette date au 31 décembre 2027 et envoyer le modèle `bonne_annee_prolongation`.

Sans `NEW_YEAR_EXTENSION_ENABLED=1`, le cron ne fait que lister les membres Platinum encore au 31 décembre 2026. Aucun WhatsApp ne part, aucune date n’est écrite. Avec le flag, chaque membre n’est traité qu’une fois : la table `crm_club_year_extensions` refuse un second passage. Un membre sans téléphone voit sa date avancée, et le journal note `sans_telephone`.

Modèle `bonne_annee_prolongation`. `{{1}}` vaut `Bonjour Camille.` ou `Bonjour.` si le prénom est vide :

{{1}} Le Travel Club TBA vous souhaite une bonne année. Votre adhésion Platinum est prolongée jusqu’au 31 décembre 2027. Elle reste nominative et réservée à vos propres réservations.

Catégorie Meta probable : Marketing.

## Réglages

La validation reste manuelle. Aucun réglage ne valide une demande tout seul.

Parrainage : 10 invitations par membre, à vie. Par défaut, une invitation est décomptée à l’envoi. La même page peut passer le décompte aux seules invitations validées. Le proche ouvre le lien personnel, pas un formulaire public.

Droit « Valider les inscriptions » : administrateurs. La grille de l’équipe peut l’ouvrir au rôle manager.

## Revue App Store

Le compte de démonstration se crée dans l’admin (fiche, invitation, mot de passe, séjour visible). Une demande en attente n’a aucun séjour. La suppression de compte est dans Mon compte › Vous. Sign in with Apple n’est pas exigé tant que le client n’a pas de connexion tierce. Voir `docs/ios-app.md`.
