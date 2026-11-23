# Inscription des clients

Demande libre sur `/inscription` (site et application). L’espace reste fermé tant qu’un administrateur n’a pas validé. La validation réutilise l’invitation déjà en place (e-mail, puis WhatsApp Twilio si le message part).

Migration à jouer à la main, sans reset : `supabase/migrations/20261123200000_signup_requests.sql`.

## Variables

| Variable | Rôle |
| --- | --- |
| `SIGNUP_SMS_ENABLED` | `1` pour exiger un code SMS. Absent : le téléphone est demandé, pas vérifié. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` | Envoi du code. Sans les trois, le flag ne bloque pas la demande. |
| `SIGNUP_LINK_SECRET` | Signature des liens d’invitation. Vide : dérivé de `CRON_SECRET` ou de la clé service. |
| `WHATSAPP_TOKEN` | Jeton permanent Meta (WhatsApp Business Cloud). |
| `WHATSAPP_PHONE_NUMBER_ID` | Numéro expéditeur. |
| `WHATSAPP_TEMPLATE_INVITATION` | Nom du modèle approuvé. Proposition : `invitation_inscription`. |
| `WHATSAPP_TEMPLATE_LANG` | `fr`. |
| `WHATSAPP_GRAPH_VERSION` | `v21.0` si vide. |

Sans `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` et `WHATSAPP_TEMPLATE_INVITATION`, l’admin reçoit un lien `wa.me` à partager. Rien n’est envoyé à Meta.

Les e-mails passent par Resend (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`), comme le reste du CRM. `CONTACT_TO_EMAIL` est ajouté aux administrateurs prévenus d’une nouvelle demande.

## Modèle WhatsApp à faire approuver

Catégorie Utility, langue `fr`, nom `invitation_inscription`.

Corps :

Bonjour {{1}}, l’agence vous invite à demander votre inscription. Ce lien est personnel et expire le {{2}}.

Bouton URL, texte « Demander mon inscription », adresse `https://travelba.fr/inscription/i/{{1}}`.

{{1}} du corps est le prénom. {{2}} est la date d’expiration. {{1}} du bouton est le jeton, pas l’adresse entière.

Le domaine `travelba.fr` doit être autorisé sur le bouton.

## Réglages

Auto-validation des invités : case sur `/admin/inscriptions`, administrateurs seulement, désactivée par défaut. Elle ne rattache pas une fiche ambiguë.

Droit « Valider les inscriptions » : administrateurs. La grille de l’équipe peut l’ouvrir au rôle manager.

## Revue App Store

Le compte de démonstration se crée dans l’admin (fiche, invitation, mot de passe, séjour visible). Une demande en attente n’a aucun séjour. La suppression de compte est dans Mon compte › Vous. Sign in with Apple n’est pas exigé tant que le client n’a pas de connexion tierce. Voir `docs/ios-app.md`.
