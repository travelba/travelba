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

Deux gestes, pour Israël, les États-Unis et le Royaume-Uni :

- **L’agence s’en charge** — le prix est affiché avant le clic : 25 € par passager, hors frais officiels. Le clic coche le service à la carte et lance le parcours. États-Unis et Royaume-Uni : les questions sont obligatoires avant d’activer le bouton. Israël n’a pas de questions.
- **Lien officiel** — ouvre le site de l’État. Ne coche pas le service. Ne lance pas le parcours.

Après le lancement, le client ne voit que la piste : Préparation, Remplissage, Validation, Paiement, Pièce. Pièce ouvre le PDF déjà au coffre.

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
- Proposer « Obtention du visa » dans À la carte. Seul « L’agence s’en charge » crée ce service.
- Un second bouton « Faire la demande » à côté du lien officiel.
- Inventer un frais ou un horaire.
- Envoyer un message client tant que le modèle WhatsApp n’est pas approuvé.
- Logger un numéro de passeport.
