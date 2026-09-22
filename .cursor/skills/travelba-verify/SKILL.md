---
name: travelba-verify
description: >-
  Verify Travelba changes: unit tests, tsc, build, local next start, browser
  staff vs client incognito, puppeteer domcontentloaded, do not publish real
  trips or seed prod. Use before declaring a CRM/UI task done or a prod launch.
---

# Travelba — vérifier

Aucune tâche UI/CRM n’est finie sur un screenshot. Exercer le flux. Si pas de browser tools : curl + tests, et le dire.

## Commandes (local)

```bash
node --test lib/crm/*.test.ts
npx tsc --noEmit
npm run build
```

Pas de script `test` npm : `node --test` (modules en imports relatifs, pas `@/` dans les tests — voir `ingest-types` / `carnet`).

`npm run lint` si ESLint touche les fichiers édités.

Prod build local : `npm run start` (port 3000). Ne pas laisser un zombie `next-server` + un second start.

## Browser

- **Deux contextes** : staff (`/admin/login`) et client (`/connexion`). Un staff déjà loggé sur `/connexion` est renvoyé vers `/admin` — utiliser une fenêtre privée pour le client.
- Ne **pas** publier un vrai séjour client pour tester. Créer un dossier **brouillon** sur un client test, ou rester en preview admin.
- Après test : supprimer le dossier test (pas le client prod).
- Mur téléphone : sans `phone`, Accueil/Résas bloqués ; **Vous** reste accessible.
- Carnet : hôtel répété les nuits, pas d’heure 00h00, IATA puis ville, jours vides sautés, brouillon invisible en client.
- Import : `npx tsx --test lib/crm/ingest-parse.test.ts` après tout nouveau type de PDF (skill `travelba-document-ingest`). Ne pas publier un vrai séjour pour tester l’extract.
- Inviter : copier le lien ; ne pas spam un vrai client.
- Revolut : ne pas « matcher » un virement réel sur un faux client.

UI client : viewport **390** et **1280**. Admin : 1280.

Routes qui partagent l’état : fiche admin ↔ `/mon-compte/profil` ; items admin ↔ carnet client **après publish seulement**.

## Puppeteer / agents computer-use

- `waitUntil: "domcontentloaded"` (pas `networkidle0` : Unsplash + CoverPhoto = Chrome « page couldn’t load »).
- Abort ou ignore `images.unsplash.com` si le run est bloqué.
- Chrome : `puppeteer-core` + `/usr/bin/google-chrome` dans cet environnement.

## Preview Vercel

Souvent **SSO**. Demander un bypass (`get_access_to_vercel_url`) plutôt que de conclure « pas en ligne ». Production = `https://travelba.fr`, pas `*.vercel.app`.

## Prod

Skill `travelba-go-live` smoke. **Interdit** : `seed:demo`, reset `crm_staff`, echo PII dans la revue.

## Sécurité avant commit

Pas de secrets. SQL paramétré. Signed URL uniquement via `/api/files`. Si Opsera MCP `needsAuth`, ne pas bloquer le ship — relancer le scan plus tard, ne pas inventer un rapport.
