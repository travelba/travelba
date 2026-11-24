---
name: travelba-visa
description: >-
  Travelba visa desk: ETA-IL, ESTA, UK ETA, Astra fill, client steps, Pliant
  ceiling. Use when a dossier needs a formality, the client must follow the
  request, or the agent cannot find Lancer le parcours.
---

# Travelba — formalités

Israël, États-Unis, Royaume-Uni. Passeport français. Les autres pays restent un lien officiel et un dépôt manuel.

## Où est la section

L’itinéraire est juste sous la photo du séjour. Le bandeau « pièce manquante » et la note client restent une ligne au-dessus de l’itinéraire.

La section **Visa** est en bas, avec les passeports. Le même bloc est sur le séjour client et sur le dossier agence, une fois la demande lancée. Un refus ne cache pas la section.

Sur la fiche agence, la demande est une ligne **Visa** dans **Services proposés**, interrupteur éteint par défaut. Le client ne voit la carte (« L’agence s’en charge ») que si l’agence l’active. Une demande déjà acceptée reste visible. Pas d’autre entrée pour proposer le visa.

Deux gestes, pour Israël, les États-Unis et le Royaume-Uni, même règle client et agence :

- **Avant validation** — carte avec le nom de la formalité, le lien officiel, et le bouton « L’agence s’en charge ». Pas de pourcentage, pas de rail, pas de « Nous nous en occupons ». Le prix n’est pas affiché : il apparaît dans la confirmation, au clic (`VISA_EUR`, frais d’État de `VISA_OFFICIAL`). États-Unis et Royaume-Uni : les questions sont obligatoires avant d’activer le bouton. Israël n’a pas de questions.
- **Confirmation** — un bouton, puis le prix, tous les voyageurs cochés (on peut en retirer). Rien ne démarre avant cette confirmation. Une carte déjà à 45 % (ou toute étape) sans `accepted_at` revient à cette carte.
- **L’agence lance à la place du client** — dans le bloc Visa du dossier, avant le démarrage, un bouton « Lancer la demande pour le client » par pays détecté. Mêmes voyageurs, mêmes réponses ESTA ou Royaume-Uni, même prix et mêmes frais d’État, puis confirmation. Cela active `offer_visa` si besoin et démarre le même parcours. Le serveur refuse encore sans passeport français ou sans les réponses, avec une phrase lisible. L’auteur est enregistré (`launched_by`, `launched_by_name`) et noté au journal. Le client voit le suivi. `lancer_formalite` est ce geste (`confirmer` true). `statut_formalite` lit le parcours. Le remplissage du portail et le paiement restent à l’écran.
- **Après confirmation** — le parcours et le remplissage en arrière-plan (ETA-IL) partent ensemble. Le lien officiel disparaît. Le client n’a pas de retour arrière. L’agence a **Recommencer** : la demande repart de zéro, et le client revoit la carte de départ. Sans Pliant, le parcours s’arrête au paiement. Pendant le clic, le bouton dit « Demande en cours… ».
- **Déjà valable** — si le visa est encore valable, ou si l’ESTA / l’ETA couvre tout le séjour, on ne propose pas de le faire : pas de carte « L’agence s’en charge », pas de lien officiel comme appel à déposer, pas de bouton « Faire l’ESTA » ou « Faire l’ETA » dans l’e-mail. Un ESTA ou une ETA qui expire avant le retour, ou lié à un ancien passeport, reste à refaire.

WhatsApp seulement quand la pièce est dans l’espace, pas à la validation. Le message joint le fichier (PDF ou image). Modèles v2 `autorisation_validee_document_v2` et `autorisation_validee_image_v2` : « Bonne nouvelle ! Votre autorisation {{3}} a été validée. Vous la trouverez ci-jointe. » {{3}} est le nom réel (ESTA, ETA, ETA-IL, eTA Canada, NZeTA, ETIAS, e-Visa et le pays, sinon Visa ou ETA). Déposés par `deposer_modeles_autorisation_whatsapp`. Le SID est dans `crm_whatsapp_content_sids`, sinon la variable `_V2`. Tant que Meta n’a pas approuvé la v2, l’envoi reste sur `autorisation_validee_document` et `autorisation_validee_image`. Sans aucun modèle approuvé, rien ne part. « Déjà envoyé » compte un envoi v1 ou v2 : une ancienne carte ne bloque pas. L’écran du séjour et l’e-mail disent le même nom, sans attendre Meta. `notifier_piece` `forcer` true, et le bouton Renvoyer du bloc ESTA ou ETA, renvoient le fichier. Deux pièces du même client partent chacune avec son document.

Les autres pays : nom, formalité si elle est connue, lien officiel, dépôt du PDF. Pas de parcours Astra.

L’agence confirme avant l’envoi, depuis le header du dossier. Le paiement s’arrête sans Pliant.

## Parcours

1. Lancer — préparation, le séjour s’ouvre sans les prix.
2. Remplir le portail — GPT-6 Astra, uniquement `gpt-6-astra`, hôte officiel. Le navigateur est Chromium empaqueté (`@sparticuz/chromium`) sur Vercel, ou Chrome local. Pas de repli vers un autre modèle. Si le navigateur ne s’ouvre pas, le dire et le réparer. Ne pas laisser « Navigateur indisponible ». Le code à 6 chiffres envoyé à `contact@travelba.fr` est lu dans la boîte Gmail déjà branchée et saisi. Pas de hold pour le demander à l’agent. Le chiffre n’est pas journalisé.
3. Confirmer — l’agent, avant l’envoi.
4. Paiement — s’arrête si Pliant n’est pas branché. Aucun débit avant un paiement enregistré.
5. Pièce — le PDF va dans Pièces.

Le client voit ces cinq étapes sur son séjour : Préparation, Remplissage, Validation, Paiement, Pièce.

## Plafond

30 % au-dessus de la dépense officielle, au cours BCE. 25 ILS, 40,27 USD, 20 GBP. Une carte par dossier, au nom du titulaire. Pas de PAN stocké. Les cartes se créent sur la réservation. Le nombre de paiements suit les voyageurs (au moins 2) : il est envoyé dans `maxTransactionCount`.

Toutes les cartes (MCP, formulaire du dossier, runs hôtel, formalité) partent sans blocage. `issuePliantCard` interroge `/cards/available-cards` (cache d’une minute). Le défaut est `PLIANT_TRAVEL_PURCHASING_VIRTUAL_VISA_300_N3D` (Visa Travel 3 %, pas enrôlée 3DS) pour les hôtels, le GDS et la plupart des commerçants. `PLIANT_TRAVEL_PURCHASING_VIRTUAL_VISA_300` (3DS frictionless) seulement si on le demande, pour un commerçant qui l’exige (ex. Ryanair) : s’il n’est pas émissible, « Pliant : la carte 3DS frictionless n’est pas disponible sur ce compte. » Sinon `PLIANT_VIRTUAL_TRAVEL`, puis le repli. Jamais une config `_CC` (Commercial Choice refuse des commerçants, dont DAYUSE). Le corps d’une carte voyage envoie toujours `maxTransactionCount` (1 par défaut : sans ce champ, Pliant pose 3 ou 5), `limitRenewFrequency` `TOTAL`, et `transactionLimit` égal au plafond. Le champ `type` n’est pas envoyé. Les contrôles partent vides (`emptyPliantCardControls`) puis sont confirmés par PUT. S’ils ne se vident pas, l’émission lève « Pliant n’a pas retiré les restrictions de la carte voyage. » Si aucune carte voyage n’est activée, le repli reste l’ancien produit : `PLIANT_SINGLE_USE` pour 1 achat (le nombre n’est pas envoyé) ou `PLIANT_VIRTUAL` au-delà (formalité : plusieurs paiements, pas l’usage unique), et la réponse porte « Cartes voyage non activées sur le compte Pliant : 3DS possible. » `purpose` reste obligatoire pour une config qui finit par `SINGLE_USE`. La réponse de création expose `card_config`.

Changer un plafond déjà émis (`modifier_plafond_pliant`, bouton Modifier le plafond) appelle `PUT /cards/limits/{cardId}`. `PATCH /cards/{cardId}` ne change que le libellé. Le corps envoie `limit` et `transactionLimit` égaux au nouveau plafond, `limitRenewFrequency` `TOTAL`, et le `maxTransactionCount` déjà connu. Puis `GET /cards/{cardId}`. `ecrit: true` seulement si les deux montants relus sont le nouveau plafond. `crm_booking_cards` et `crm_pliant_cards` sont mis à jour ensuite.

## Jeton Pliant

Auth0 (`infinnityprodinternal`) n’accorde qu’une poignée de jetons par jour, valables 24 h. Toutes les cartes, la synchro et les formalités passent par `acquirePliantToken` (`lib/crm/pliant-auth.ts`). Le jeton reste dans `crm_integrations` (service role). Le verrou `crm_claim_integration_refresh` empêche deux passages de le redemander. Un quota dépassé bloque le parc une heure, sans nouvel appel. Une preview ne présente pas `PLIANT_CLIENT_ID` / `PLIANT_CLIENT_SECRET` (`productionOnlySecret`). Ne pas ajouter un second `client_credentials`. Le test `le client_credentials Pliant ne vit que derrière le verrou` échoue si quelqu’un le fait.

## Carte depuis le MCP

`creer_carte_pliant` reprend le bloc Carte Pliant (onglet Argent) du dossier pour le libellé, le plafond et les contrôles vides. `transactions` vaut 1 par défaut. Le produit réellement émis est `card_config` dans la réponse : `PLIANT_TRAVEL_PURCHASING_VIRTUAL_VISA_300_N3D` par défaut, `PLIANT_TRAVEL_PURCHASING_VIRTUAL_VISA_300` si `trois_ds` est vrai (seulement pour un commerçant qui exige le 3DS, comme Ryanair). Un nombre plus grand (par exemple 5, plafond 1 500 €) envoie ce nombre, le plafond total et le même montant par achat. Aucun blocage. `avertissement` apparaît si les cartes voyage ne sont pas activées. La carte reste liée au dossier (`crm_booking_cards` et `crm_pliant_cards`) ; chaque débit s’y rattache dès l’autorisation, en attente, puis se confirme au règlement. Un paiement `DECLINED` se lit dans `pliant_debits` (`etat` « refusé », motif en français, jamais proposé au rattachement) et sur Argent › Pliant (« Refusé : motif »). `dossier_id` ou `reference`, avec `carte_id`, liste les refus de cette carte. Le libellé (`label`, 40) et l’objet (`purpose`, 200) portent le client, l’hôtel ou le fournisseur et la référence (`Bensaid – Phulay Bay – TB-2026-0088`). Les accents deviennent des lettres (`Andréa` → `Andrea`). Le prénom et le nom du titulaire restent la personne, pas cette phrase. `lire_carte_pliant` lit le numéro chez Pliant (`readPliantCardSecrets`, hôte PCI) pour cette carte seulement. `bloquer_carte_pliant` gèle la carte (`POST /cards/{id}/lock`) et `debloquer` la rouvre (`unlock`) ; le statut `locked` ou `active` est sur le dossier. Pas de suppression. Le jeton est `TRAVELBA_MCP_CARD_TOKENS`, pas le jeton passeport. Pas de PAN stocké. Journal `crm_mcp_card_events` (`creation`, `reveal`, `blocage`, `deblocage`).

## Scan pour le formulaire

Le fichier du passeport sort par l’outil MCP `scan_passeport` (même jeton que `passeport_voyageur`). URL Storage dix minutes, nom et type mime. Si `pdf` est vrai, ce n’est pas une photo png, jpg ou jpeg. `lieu_naissance` est sur `passeport_voyageur` (`place_of_birth`). Le coffre n’a pas de champ biométrique.

## Interdits

- Remettre le visa au-dessus de l’itinéraire.
- Proposer la formalité au client sans activer Visa dans Services proposés.
- Une seconde entrée visa à côté de cette ligne.
- Appeler Auth0 ou `oauth/token` Pliant en dehors de `requestPliantToken`.
- Retirer Enregistrement ou Obtention du visa de À la carte.
- Un second bouton « Faire la demande » à côté du lien officiel.
- Inventer un frais ou un horaire.
- Envoyer un message client tant que le modèle WhatsApp n’est pas approuvé.
- Logger un numéro de passeport.
