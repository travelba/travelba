---
name: travelba-whatsapp-ops-agent
description: >-
  Staff WhatsApp inbound agent on the Concierge number: allowlist, create CRM
  voyage from passports/PDFs/consignes, recap, publish mTrip, opt-in then
  dossier. Use when editing the Twilio webhook, wa-ops-*, ingest from WhatsApp,
  or when the user mentions agent WhatsApp CRM, transférer passeports, ou
  créer un voyage sans se connecter.
---

# Travelba — collègue WhatsApp → CRM

## Produit

Même numéro Concierge (`+33 7 56 84 13 15`). **Staff only** (liste blanche).
Le client continue d’utiliser Le Concierge (opt-in → dossier).

Le staff **transfère comme à un collègue** : pièces + 2–3 phrases. Pas de
menu de commandes. L’agent ouvre un brouillon CRM, pose **une** question s’il
manque un truc, envoie un récap, puis le conseiller dit « ok » / « envoie »
en français.

Webhook : `POST /api/webhooks/twilio/whatsapp`  
TwiML vide, travail dans `after()`. Album WhatsApp : debounce ~4 s, un seul
« Reçu », un seul récap.

## Règles absolues

1. **Allowlist** `AGENCY_STAFF_WHATSAPP` — jamais créer un voyage depuis un numéro hors liste.
2. Opt-in client **puis** dossier (pas de fusion). Pas de `/v/` sans publish mTrip réussi.
3. Confirmation staff en langage naturel avant publish + opt-in (filet OCR).
4. Titres devis métier — jamais `Capture…` / `Screenshot…`.
5. Secrets (`TWILIO_*`, `SUPABASE_SERVICE_ROLE_KEY`) uniquement en env.
6. Copy staff = tutoiement, phrases courtes. Ne pas changer la copy Concierge client.

## Geste staff (pas des commandes à retenir)

- Photos / PDFs + « Panama 10–18 oct, Marie 06… marie@… »
- Ack immédiat : « Reçu, je m'en occupe. »
- Puis récap + « Je peux envoyer à Marie ? »
- « oui » / « ok envoie » → publish mTrip + opt-in client
- S’il manque le WhatsApp : **une** question
- « autre voyage » / « autre client » → nouveau dossier (il demande si un brouillon est déjà ouvert)

Client « Oui » → dossier `/d/` + `/v/`.

Inconnu → ack Concierge, **pas** de voyage.

## Env

```
SUPABASE_SERVICE_ROLE_KEY=
AGENCY_OWNER_USER_ID=          # UUID compte CRM
AGENCY_STAFF_WHATSAPP=336…,337…
TWILIO_WEBHOOK_URL=https://travelba.fr/api/webhooks/twilio/whatsapp
# TWILIO_WEBHOOK_VALIDATE=0   # local
# OPENAI_API_KEY= ou AI_GATEWAY_API_KEY=
# AGENCY_WA_DEBOUNCE_MS=4000
```

Table : `agency_wa_ops_sessions` (`notes` JSON : awaiting, history, pending, contact).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `app/api/webhooks/twilio/whatsapp/route.ts` | Webhook Twilio |
| `lib/agency/twilio-inbound.ts` | Signature + médias |
| `lib/agency/wa-ops-agent.ts` | Collègue staff / client |
| `lib/agency/wa-ops-intent.ts` | Extraction + tour LLM |
| `lib/agency/wa-ops-session.ts` | Sessions + debounce album |
| `lib/mtrip/ingest-passports.ts` | Import passeports (aussi admin) |
| `lib/mtrip/ingest-documents.ts` | Import résas / devis |
| `lib/agency/send-voyage.ts` | Publish / opt-in / dossier |

## Ne pas faire

- Traiter un client comme staff
- Envoyer le dossier sans opt-in Oui
- Envoyer `/v/` si publish a échoué
- Remettre un menu `nouveau · c'est tout · envoyer`
- Changer la copy Concierge (`travelba-concierge-whatsapp`)
