---
name: travelba-my-trip
description: >-
  Rules for Travelba My Trip / mTrip Traveler View: publish voyage, app links,
  short URL /v/{code}, voyage titles (city+country+dates), and CRM→mTrip mapping.
  Use when editing publish-guide, app_links, short-links /v/, traveler view,
  mTrip mobile_app_link, voyage title, or when the user mentions My Trip,
  Récapitulatif du voyage, Traveler View, or mTrip app access.
---

# Travelba — My Trip (Traveler View)

## Produit

**My Trip** = récapitulatif voyageur mTrip (Traveler View / app).

Lien court WhatsApp : `https://travelba.fr/v/{short_code}` → redirect vers `app_links` mTrip.

Libellé client (WhatsApp) : **Récapitulatif du voyage** (pas « My Trip » dans le SMS).

## Règles absolues

1. **Publier mTrip avant** d’envoyer le lien `/v/…` (sinon 404 « Traveler View pas encore disponible »).
2. Auth mTrip : uniquement `mtrip_account_id` (TBT test `66582`) — **jamais** avec `primary_id`.
3. Titre voyage = destinations + dates via `buildVoyageTitle` :
   `Marrakech, Maroc · 10 sept - 17 sept` (toutes les villes si multi-dest).
4. Contenu riche + geo cohérente → aussi lire skill `travelba-mtrip-max-publish`.

## Flux CRM

1. Passagers + confirmations + devis  
2. **Publier mTrip** → `POST /api/admin/mtrip/guides/[id]/publish`  
3. Remplit `app_links`, `mtrip_identifier`, passwords travelers  
4. Envoi WhatsApp dossier → inclut `travelba.fr/v/{short_code}`

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `lib/mtrip/publish-guide.ts` | Publish + app_links |
| `lib/mtrip/client.ts` | `mobile_app_link`, upsert trip |
| `lib/agency/short-links.ts` | `/v/[code]` → traveler URL |
| `app/v/[code]/route.ts` | Redirect public |
| `lib/mtrip/voyage-title.ts` | Titre ville/pays + dates |
| `lib/agency/quote-link.ts` | `buildShortTripUrl`, `short_code` |

## Ne pas faire

- Envoyer `/v/` sans publish réussi  
- Utiliser un hôtel LE hors pays du trip  
- Remplacer le titre auto par « Voyage NomClient »  
- Mettre des signed URL Supabase trop longues dans `documents.url` mTrip  

## Quand ça casse

| Symptôme | Piste |
|----------|--------|
| Lien `/v/` 404 | Pas de `app_links` → republier |
| Mauvais hôtel / pays | Skill `travelba-mtrip-max-publish` (geo) |
| Titre vide / « Nouveau voyage » | Recharger devis / dates → `buildVoyageTitle` |
