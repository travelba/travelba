# Inscription des clients

Demande libre sur `/inscription` (site et application). L’espace reste fermé tant qu’un administrateur n’a pas validé. La validation réutilise l’invitation déjà en place (e-mail, puis WhatsApp Twilio si le message part).

Migrations à jouer à la main, dans l’ordre, sans reset :

1. `supabase/migrations/20261123200000_signup_requests.sql`
2. `supabase/migrations/20261123220000_travel_club_referrals.sql`
3. `supabase/migrations/20261123233000_club_platinum.sql`

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

Bonjour {{1}}, le Travel Club TBA a le plaisir de vous offrir l’adhésion Platinum pour une durée d’un an. Cette adhésion est nominative et réservée à vos propres réservations. Ce lien personnel expire le {{2}}.

{{1}} prénom, {{2}} date.

`invitation_parrainage` — catégorie Meta probable : **Marketing** (recommandation et offre d’adhésion ; le destinataire n’a pas demandé le message).

Bonjour {{1}}, {{2}} vous a recommandé au Travel Club TBA, qui a le plaisir de vous offrir l’adhésion Platinum pour une durée d’un an. Cette adhésion est nominative et réservée à vos propres réservations. Ce lien personnel expire le {{3}}.

{{1}} prénom du proche, {{2}} prénom du parrain, {{3}} date.

## Réglages

Auto-validation des invités : case sur `/admin/inscriptions`, administrateurs seulement, désactivée par défaut. Elle ne rattache pas une fiche ambiguë.

Parrainage : 10 invitations par membre, à vie. Par défaut, une invitation est décomptée à l’envoi. La même page peut passer le décompte aux seules invitations validées.

Droit « Valider les inscriptions » : administrateurs. La grille de l’équipe peut l’ouvrir au rôle manager.

## Revue App Store

Le compte de démonstration se crée dans l’admin (fiche, invitation, mot de passe, séjour visible). Une demande en attente n’a aucun séjour. La suppression de compte est dans Mon compte › Vous. Sign in with Apple n’est pas exigé tant que le client n’a pas de connexion tierce. Voir `docs/ios-app.md`.
