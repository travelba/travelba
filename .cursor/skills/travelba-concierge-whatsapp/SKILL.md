---
name: travelba-concierge-whatsapp
description: >-
  Rules for Travelba WhatsApp Business Concierge via Twilio: opt-in then dossier
  message, short links /d/ and /v/, Content templates, and CRM send flow.
  Use when editing whatsapp.ts, Twilio templates, opt-in, dossier send, Concierge
  copy, or when the user mentions WhatsApp Business, Le Concierge, opt-in, or
  message type voyage.
---

# Travelba — Concierge WhatsApp Business

## Produit

Canal **WhatsApp Business TBA** (Twilio) — signature **Le Concierge**.

Numéro public : `+33 7 56 84 13 15` (`lib/site.ts`).

Hors fenêtre 24h → **templates Content** obligatoires (sinon erreur 63016).

## Plan de messages (ordre)

### 1 — Opt-in

Boutons : **Oui** / **Non merci**

```
Bonjour {{prénom}},
Je suis Le Concierge de Travel Business Agency, je suis là pour t'accompagner (info pratique, rappels utiles, réponses à vos questions) pendant ton séjour.
Veux-tu recevoir ton dossier voyage ?
```

Template : `TWILIO_WHATSAPP_OPTIN_CONTENT_SID`  
API : `POST /api/admin/mtrip/guides/[id]/whatsapp/optin`  
Kind send : `optin`

### 2 — Dossier voyage (après Oui)

Texte **verbatim** :

```
Bonjour Marie,
Voici ton dossier voyage :
Suivie des dépenses
https://travelba.fr/d/xk7m2npq

Récapitulatif du voyage
https://travelba.fr/v/xk7m2npq

— Le Concierge
```

- `{{1}}` = prénom  
- `{{2}}` = lien court dépenses `/d/{code}`  
- `{{3}}` = lien court My Trip `/v/{code}` (après publish mTrip)

Template : `TWILIO_WHATSAPP_DOSSIER_CONTENT_SID` (`tba_concierge_dossier_liens_fr_v2`)  
Fallback si pending : `concierge_note_fr` avec le corps complet  
API : `POST /api/admin/mtrip/guides/[id]/send` (`publish: false`)  
Kind send : `dossier`

Builder : `buildClientTripMessage` dans `lib/agency/whatsapp.ts`

## Règles absolues

1. **Opt-in d’abord**, dossier ensuite (UI CRM : 2 boutons séparés).  
2. Liens **courts** uniquement (`/d/`, `/v/`) — pas d’URL mTrip longues ni `/devis/{uuid32}`.  
3. Ne pas inventer d’autre signature que **— Le Concierge**.  
4. Garder l’orthographe produit **Suivie des dépenses** / **Récapitulatif du voyage**.  
5. Secrets Twilio uniquement en env (`TWILIO_*`) — jamais commit.

Inbound client (après opt-in) : le webhook [`/api/webhooks/twilio/whatsapp`](app/api/webhooks/twilio/whatsapp/route.ts) envoie le dossier si le voyageur répond **Oui**. Les numéros staff (liste blanche) sont l’agent ops CRM — skill `travelba-whatsapp-ops-agent`.

## Env

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+33756841315
TWILIO_WHATSAPP_CONTENT_SID=…          # note fallback
TWILIO_WHATSAPP_OPTIN_CONTENT_SID=…    # quick-reply
TWILIO_WHATSAPP_DOSSIER_CONTENT_SID=…  # dossier 3 vars
```

Scripts :  
`scripts/create-whatsapp-optin-template.mjs`  
`scripts/create-whatsapp-dossier-template.mjs`

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `lib/agency/whatsapp.ts` | Envoi Twilio, templates, copy |
| `app/api/admin/mtrip/guides/[id]/whatsapp/optin/route.ts` | Opt-in |
| `app/api/admin/mtrip/guides/[id]/send/route.ts` | Dossier |
| `components/admin/MtripGuideWorkspace.tsx` | UI opt-in / dossier |
| `lib/agency/quote-link.ts` | Short URLs |
| Skills liés | `travelba-suivi-depenses`, `travelba-my-trip` |

## Ne pas faire

- Texte libre hors 24h sans template  
- Mélanger opt-in et dossier en un seul envoi forcé  
- Remettre identifiant / mot de passe mTrip dans le WhatsApp si le lien `/v/` suffit  
- Changer la copy dossier sans mettre à jour ce skill **et** `buildClientTripMessage`  

## Quand ça casse

| Symptôme | Piste |
|----------|--------|
| 63016 | Template Content / hors fenêtre |
| Pas de boutons opt-in | Template quick-reply encore `pending` Meta |
| Pas de lien My Trip | Publish mTrip manquant |
| Ancienne copy « Dépenses / My Trip » | Vérifier `buildClientTripMessage` + SID v2 |
