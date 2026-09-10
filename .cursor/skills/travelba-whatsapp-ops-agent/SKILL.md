---
name: travelba-whatsapp-ops-agent
description: >-
  Staff WhatsApp inbound agent on the Concierge number: allowlist, create CRM
  voyage from passports/PDFs/consignes, recap, publish mTrip, opt-in then
  dossier. Can also launch a Cursor Cloud Agent PR after staff confirms a
  product/bug remark. Use when editing the Twilio webhook, wa-ops-*, Cursor
  webhook, ingest from WhatsApp, or when the user mentions agent WhatsApp CRM.
---

# Travelba — collègue WhatsApp → CRM (+ Cursor)

## Produit

Même numéro Concierge (`+33 7 56 84 13 15`). **Staff only** (liste blanche).
Le client continue d’utiliser Le Concierge (opt-in → dossier).

Le staff **transfère comme à un collègue** : pièces + 2–3 phrases. Pas de
menu de commandes. L’agent ouvre un brouillon CRM, pose **une** question s’il
manque un truc, envoie un récap, puis le conseiller dit « ok » / « envoie »
en français.

Sur le **même fil**, un bug ou une idée produit (« le récap est trop long »)
n’est pas une consigne voyage : l’agent propose une PR Cursor, **demande
avant** de lancer, puis envoie le lien.

Webhook voyage : `POST /api/webhooks/twilio/whatsapp`  
Webhook Cursor : `POST /api/webhooks/cursor/agents`

## Règles absolues

1. **Allowlist** `AGENCY_STAFF_WHATSAPP` — jamais créer un voyage depuis un numéro hors liste.
2. Opt-in client **puis** dossier (pas de fusion). Pas de `/v/` sans publish mTrip réussi.
3. Confirmation staff en langage naturel avant publish + opt-in (filet OCR).
4. Titres devis métier — jamais `Capture…` / `Screenshot…`.
5. Secrets (`TWILIO_*`, `SUPABASE_SERVICE_ROLE_KEY`, `CURSOR_API_KEY`) uniquement en env.
6. Copy staff = tutoiement, phrases courtes. Ne pas changer la copy Concierge client.
7. **Zéro PII** dans un prompt Cursor (pas de passeport, WhatsApp client, email).
8. 1 agent Cursor à la fois par numéro. PR, pas de merge auto.
9. `awaiting=send_confirm` → « oui » = envoi client. `awaiting=cursor_confirm` → « oui » = lancer Cursor.

## Geste staff (pas des commandes à retenir)

- Photos / PDFs + « Panama 10–18 oct, Marie 06… marie@… »
- Ack immédiat : « Reçu, je m'en occupe. »
- Puis récap + « Je peux envoyer à Marie ? »
- « oui » / « ok envoie » → publish mTrip + opt-in client
- « le récap est trop long » → « Je lance une PR pour ça ? » → oui → Cloud Agent
- Client « Oui » → dossier `/d/` + `/v/`

Inconnu → ack Concierge, **pas** de voyage.

## Env

```
SUPABASE_SERVICE_ROLE_KEY=
AGENCY_OWNER_USER_ID=
AGENCY_STAFF_WHATSAPP=336…,337…
TWILIO_WEBHOOK_URL=https://travelba.fr/api/webhooks/twilio/whatsapp
CURSOR_API_KEY=                 # Cursor Dashboard → API Keys
CURSOR_WEBHOOK_SECRET=          # ≥ 32 caractères
CURSOR_AGENT_REPO=https://github.com/travelba/travelba
# CURSOR_WEBHOOK_URL=https://travelba.fr/api/webhooks/cursor/agents
# CURSOR_WEBHOOK_VALIDATE=0
# OPENAI_API_KEY= ou AI_GATEWAY_API_KEY=
# AGENCY_WA_DEBOUNCE_MS=4000
```

Table : `agency_wa_ops_sessions` (`notes` JSON : awaiting, history, pending, contact, productBrief, cursorAgentId).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `app/api/webhooks/twilio/whatsapp/route.ts` | Webhook Twilio |
| `app/api/webhooks/cursor/agents/route.ts` | Webhook agent Cursor |
| `lib/agency/cursor-cloud.ts` | API Cursor + sanitize PII |
| `lib/agency/twilio-inbound.ts` | Signature + médias |
| `lib/agency/wa-ops-agent.ts` | Collègue staff / client |
| `lib/agency/wa-ops-intent.ts` | Voyage vs produit + tour LLM |
| `lib/agency/wa-ops-session.ts` | Sessions + debounce album |
| `lib/mtrip/ingest-passports.ts` | Import passeports (aussi admin) |
| `lib/mtrip/ingest-documents.ts` | Import résas / devis |
| `lib/agency/send-voyage.ts` | Publish / opt-in / dossier |

## Ne pas faire

- Traiter un client comme staff
- Envoyer le dossier sans opt-in Oui
- Envoyer `/v/` si publish a échoué
- Envoyer un passeport / numéro client à Cursor
- Merger une PR Cursor sans relecture
- Remettre un menu `nouveau · c'est tout · envoyer`
- Changer la copy Concierge (`travelba-concierge-whatsapp`)
