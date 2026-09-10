---
name: travelba-whatsapp-ops-agent
description: >-
  Staff WhatsApp inbound agent on the Concierge number: allowlist, create CRM
  voyage from passports/PDFs/consignes, recap, publish mTrip, opt-in then
  dossier. Use when editing the Twilio webhook, wa-ops-*, ingest from WhatsApp,
  or when the user mentions agent WhatsApp CRM, transférer passeports, ou
  créer un voyage sans se connecter.
---

# Travelba — agent ops WhatsApp → CRM

## Produit

Même numéro Concierge (`+33 7 56 84 13 15`). **Staff only** (liste blanche).
Le client continue d’utiliser Le Concierge (opt-in → dossier). L’agent ops
reçoit passeports + confirmations + consignes et crée `agency_mtrip_guides`.

Webhook : `POST /api/webhooks/twilio/whatsapp`  
Twilio console → ce URL (méthode POST). Réponse TwiML vide, traitement via `after()`.

## Règles absolues

1. **Allowlist** `AGENCY_STAFF_WHATSAPP` — jamais créer un voyage depuis un numéro hors liste.
2. Opt-in client **puis** dossier (pas de fusion). Pas de `/v/` sans publish mTrip réussi.
3. Confirmation staff **« Envoyer »** avant publish + opt-in (filet OCR).
4. Titres devis métier — jamais `Capture…` / `Screenshot…`.
5. Secrets (`TWILIO_*`, `SUPABASE_SERVICE_ROLE_KEY`) uniquement en env.

## Commandes staff

- `nouveau` — nouveau brouillon
- `c'est tout` — récap + lien CRM
- `envoyer` / `oui` (après récap) — publish mTrip + opt-in client
- `annuler` — ferme la session (le brouillon CRM reste)
- `lien` — URL `/admin/mtrip/{id}`
- `aide`

Session ouverte ~45 min par numéro staff. Médias suivants = même voyage.

## Flux

```
Staff WA → webhook → allowlist
  médias → parsePassportFile (MRZ) sinon ingest-documents (devis)
  consigne → titre / dates / WA + email lead
  « c'est tout » → récap
  « Envoyer » → publish → opt-in client
Client « Oui » → dossier /d/ + /v/
```

Inconnu → ack Concierge, **pas** de voyage.

## Env

```
SUPABASE_SERVICE_ROLE_KEY=
AGENCY_OWNER_USER_ID=          # UUID compte CRM
AGENCY_STAFF_WHATSAPP=336…,337…
TWILIO_WEBHOOK_URL=https://travelba.fr/api/webhooks/twilio/whatsapp
# TWILIO_WEBHOOK_VALIDATE=0   # local
# OPENAI_API_KEY= ou AI_GATEWAY_API_KEY=  # consignes FR
```

Table : `agency_wa_ops_sessions` (service role, RLS sans policy anon).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `app/api/webhooks/twilio/whatsapp/route.ts` | Webhook Twilio |
| `lib/agency/twilio-inbound.ts` | Signature + médias |
| `lib/agency/wa-ops-agent.ts` | Routeur staff / client |
| `lib/agency/wa-ops-intent.ts` | Intent + consigne |
| `lib/agency/wa-ops-session.ts` | Sessions |
| `lib/mtrip/ingest-passports.ts` | Import passeports (aussi admin) |
| `lib/mtrip/ingest-documents.ts` | Import résas / devis |
| `lib/agency/send-voyage.ts` | Publish / opt-in / dossier |

## Ne pas faire

- Traiter un client comme staff
- Envoyer le dossier sans opt-in Oui
- Envoyer `/v/` si publish a échoué
- Changer la copy Concierge (`travelba-concierge-whatsapp`)
