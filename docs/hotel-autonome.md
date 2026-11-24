# Réservation hôtel autonome

Le client réserve dans l’application. Deux cartes Pliant restent distinctes.

1. La première carte, au montant exact, sert à passer la réservation chez le fournisseur (Little Emperors).
2. L’hôtel est payé plus tard, par le lien qu’il envoie, avec la seconde carte du parcours d’arrivée. On ne fusionne pas les cartes. Le lien `/k/` n’est pas le moyen de paiement.

Les interrupteurs naissent éteints. Rien ne part vers un hôtel, et aucun paiement n’est lancé, tant qu’ils le restent.

## Avis à l’agence

À la confirmation, à l’échec et à l’annulation, un e-mail part vers `contact@travelba.fr` (ou `HOTEL_DIRECT_TEST_TO` s’il est défini). Il nomme le client, l’hôtel, les dates, la chambre et le tarif, le montant, le mode de paiement, le fournisseur et la confirmation, l’annulation, les quatre derniers chiffres de la carte fournisseur, et le lien du dossier.

La file `crm_hotel_notice_outbox` dédoublonne par séjour et par événement. Cinq essais, puis une alerte `hotel_booking` si l’envoi échoue pour de bon. La même alerte ouvre le toast et la notification du navigateur déjà en place.

## Demande de lien

`auto_hotel_pay_request` rouvre le mail automatique seulement pour un séjour réservé par le client (`direct_stay_id` ou `autonomous`). Les autres séjours, le mail VIP et Expedia restent en pause.

Le courrier demande le lien (`paymentLinkAsk`). Il ne joint pas de carte et n’invite pas l’hôtel à débiter un lien `/k/`. Les gardes déjà en place restent : un envoi dans la minute ne repart pas, une relance attend quatre heures puis le jour ouvré suivant, le silence après deux relances revient à l’agence.

Hors `HOTEL_AUTO_PAY_LIVE=1`, le message ne peut aller qu’à `HOTEL_DIRECT_TEST_TO`. Sans cette boîte, rien n’est envoyé. `crm_hotel_arrivals.requested_at` et le statut `link_requested` ne sont posés qu’après un envoi accepté.

## Canal

Une réservation passée par l’API Little Emperors garde le canal `little_emperors`. Ce n’est pas une erreur : le fournisseur est Little Emperors, et le paiement de l’hôtel reste le second parcours.

Le bug corrigé est ailleurs. Une demande envoyée par e-mail à l’hôtel, même si le tarif vient du catalogue Little Emperors, était enregistrée `little_emperors` à cause de `source_family`. Elle est maintenant `direct` (`arrival_channel`), et ce champ l’emporte sur le catalogue.

## Paiement automatique

`auto_hotel_charge_enabled` met le lien reçu (`payment_url`) en file `crm_hotel_charge_jobs`. Un seul paiement par séjour.

Le navigateur ne tourne pas sur Vercel. Les pages d’hôtel bloquent le Chromium des fonctions, le délai peut tomber après un débit, et le numéro de carte ne doit pas vivre dans le même processus que le site. Le worker est `scripts/hotel-charge-worker.ts`, sur une machine qui a Chrome :

```bash
HOTEL_CHARGE_WORKER=1 npx tsx scripts/hotel-charge-worker.ts
```

Sans ce drapeau, le script ne lit aucune carte et n’ouvre aucune page. Le numéro est lu chez Pliant au moment du paiement (`readPliantCardSecrets`). Il n’est pas écrit, pas journalisé, pas mis dans l’e-mail. Seuls les quatre derniers chiffres sont en base.

La page, le montant du séjour et le plafond de la seconde carte doivent être le même montant, en euros. Sinon le worker s’arrête. Au-dessus de `auto_hotel_charge_max_cents` (2 000 € par défaut), validation humaine. Un 3DS, une page inconnue ou une erreur s’arrêtent aussi. L’accueil affiche alors « Payer à la main ».

Quand l’interrupteur est ouvert, la seconde carte d’un séjour autonome est émise au montant exact, pas à +30 %. Une carte déjà émise à un autre plafond n’est pas modifiée : le paiement s’arrête.

La capture d’écran n’est prise qu’après avoir vidé les champs de carte, et seulement si la confirmation ne montre pas de numéro. Après `pliant-sync`, un débit du même montant sur cette carte passe le séjour en payé et gèle la carte (`lock`, pas une suppression).

## Réglages

Écran Réglages › Accès Hôtels, administrateurs.

| Réglage | Défaut |
| --- | --- |
| `auto_hotel_pay_request` | éteint |
| `auto_hotel_charge_enabled` | éteint |
| `auto_hotel_charge_max_cents` | 200000 (2 000 €) |

`HOTEL_DIRECT_TEST_TO` reçoit les essais. `HOTEL_AUTO_PAY_LIVE=1` est le seul drapeau qui autorise l’adresse de l’hôtel. Les deux interrupteurs doivent en plus être ouverts.

La migration `20261124120000_hotel_auto.sql` se joue à la main. Elle n’est pas appliquée par cet envoi.

## Journal

Chaque avis, chaque demande de lien, chaque mise en file et chaque rapprochement écrit une ligne dans `crm_agency_journal`. Le résumé ne contient pas de numéro de carte.
