---
name: travelba-visa
description: >-
  Travelba visa desk: ETA-IL, ESTA, UK ETA, Astra fill, client steps, Pliant
  ceiling. Use when a dossier needs a formality, the client must follow the
  request, or the agent cannot find Lancer le parcours.
---

# Travelba — formalités

Israël, États-Unis, Royaume-Uni. Passeport français. Les autres pays restent un lien officiel et un dépôt manuel.

## Où est le bouton

**Lancer le parcours** est dans le header du dossier admin (`BookingEditor`), dans la carte du carnet, à côté d’Enregistrer. Pas sous les vols, pas sur la fiche client, pas au milieu de la page.

Si l’utilisateur ne le voit pas : le déplacer dans ce header. Ne pas lui dire de scroller. Ne pas l’envoyer sur travelba.fr tant que le code n’y est pas. Lui donner l’URL exacte du dossier sur l’environnement qui contient le bouton.

## Parcours

1. Lancer — préparation, le séjour s’ouvre sans les prix.
2. Remplir le portail — GPT-6 Astra, uniquement `gpt-6-astra`, hôte officiel. Pas de repli vers un autre modèle.
3. Confirmer — l’agent, avant l’envoi.
4. Paiement — s’arrête si Pliant n’est pas branché. Aucun débit avant un paiement enregistré.
5. Pièce — le PDF va dans Pièces.

Le client voit ces cinq étapes sur son séjour : Préparation, Remplissage, Validation, Paiement, Pièce.

## Plafond

30 % au-dessus de la dépense officielle, au cours BCE. 25 ILS, 40,27 USD, 20 GBP. Une carte par dossier, au nom du titulaire. Pas de PAN stocké.

## Interdits

- Cacher l’action sous l’itinéraire.
- Inventer un frais ou un horaire.
- Envoyer un message client tant que le modèle WhatsApp n’est pas approuvé.
- Logger un numéro de passeport.
