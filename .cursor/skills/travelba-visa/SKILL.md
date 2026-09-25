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

La section **Visa** est en bas, avec les passeports. Le même bloc est sur le séjour client et sur le dossier agence. Un refus ne cache pas la section.

Deux gestes, pour Israël, les États-Unis et le Royaume-Uni, même règle client et agence :

- **Avant validation** — carte avec le nom de la formalité, le lien officiel, et le bouton « L’agence s’en charge ». Pas de pourcentage, pas de rail, pas de « Nous nous en occupons ». Le prix n’est pas affiché : il apparaît dans la confirmation, au clic (`VISA_EUR`, frais d’État de `VISA_OFFICIAL`). États-Unis et Royaume-Uni : les questions sont obligatoires avant d’activer le bouton. Israël n’a pas de questions.
- **Confirmation** — un bouton, puis le prix, tous les voyageurs cochés (on peut en retirer). Rien ne démarre avant cette confirmation. Une carte déjà à 45 % (ou toute étape) sans `accepted_at` revient à cette carte.
- **Après confirmation** — le parcours et le remplissage en arrière-plan (ETA-IL) partent ensemble. Le lien officiel disparaît. Pas de retour arrière. Sans Pliant, le parcours s’arrête au paiement. Pendant le clic, le bouton dit « Demande en cours… ».

WhatsApp seulement quand la pièce est dans l’espace, pas à la validation.

Les autres pays : nom, formalité si elle est connue, lien officiel, dépôt du PDF. Pas de parcours Astra.

L’agence confirme avant l’envoi, depuis le header du dossier. Le paiement s’arrête sans Pliant.

## Parcours

1. Lancer — préparation, le séjour s’ouvre sans les prix.
2. Remplir le portail — GPT-6 Astra, uniquement `gpt-6-astra`, hôte officiel. Le navigateur est Chromium empaqueté (`@sparticuz/chromium`) sur Vercel, ou Chrome local. Pas de repli vers un autre modèle. Si le navigateur ne s’ouvre pas, le dire et le réparer. Ne pas laisser « Navigateur indisponible ».
3. Confirmer — l’agent, avant l’envoi.
4. Paiement — s’arrête si Pliant n’est pas branché. Aucun débit avant un paiement enregistré.
5. Pièce — le PDF va dans Pièces.

Le client voit ces cinq étapes sur son séjour : Préparation, Remplissage, Validation, Paiement, Pièce.

## Plafond

30 % au-dessus de la dépense officielle, au cours BCE. 25 ILS, 40,27 USD, 20 GBP. Une carte par dossier, au nom du titulaire. Pas de PAN stocké.

## Interdits

- Remettre le visa au-dessus de l’itinéraire.
- Retirer Enregistrement ou Obtention du visa de À la carte.
- Un second bouton « Faire la demande » à côté du lien officiel.
- Inventer un frais ou un horaire.
- Envoyer un message client tant que le modèle WhatsApp n’est pas approuvé.
- Logger un numéro de passeport.
