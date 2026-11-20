# Staging Travelba

Environnement de travail et de démonstration pour Expedia (site review et certification B2B Rapid). Il n’est pas la production. La bascule se fait en changeant des clés et des variables, puis en jouant les migrations sur la base de production au moment voulu.

Rien dans ce document n’autorise à merger `main`, à écrire dans la base `fsmfozxgujskluxakeoq`, ni à modifier une variable Vercel de **Production**.

## État au 20 novembre 2026

Raphael a accepté la branche Supabase (environ 0,01344 USD de l’heure). Le projet séparé à 10 USD par mois n’a pas été créé.

Branche Supabase `staging` :

- Projet parent : `fsmfozxgujskluxakeoq` (production, non modifié).
- Identifiant : `28865ece-9db8-49d1-8857-92c421bae6ec`.
- Référence : `lnygnjbvuzgarseqfjlm`.
- URL : `https://lnygnjbvuzgarseqfjlm.supabase.co`.
- `with_data` : faux. Les fiches de production n’ont pas été copiées.
- `persistent` : faux dans l’API (aucun outil ne permet de le passer à vrai). La branche n’est pas liée à une branche Git et ne s’efface pas avec elle. Dans le tableau de bord Supabase, la marquer persistante pour qu’elle ne soit pas traitée comme éphémère.
- Le rejeu automatique de l’historique de production a échoué (migrations hors dépôt : `booking_requests_email`, schéma `concierge`). Les fichiers SQL du dépôt, y compris `20261121100000`, `20261121110000` et `20261121120000`, ont été appliqués à la main sur cette branche seulement, avec deux compléments de schéma absents du dépôt (`crm_private.next_booking_reference`, colonne `crm_bookings.fee_mode`).
- Comptes fictifs seulement : `revue.agence@travelba.fr` (admin) et `revue-hotels@travelba.fr` (accès Hôtels, réservation Little Emperors fermée). Aucune donnée client réelle.

Les autres Preview Vercel lisent encore la base de production. Seule la branche Git `staging` reçoit l’URL et la clé anon de `lnygnjbvuzgarseqfjlm`.

La clé `service_role` de cette branche n’est pas exposée par l’API. Tant qu’elle n’est pas collée dans la variable Preview `SUPABASE_SERVICE_ROLE_KEY` limitée à la branche Git `staging`, le code refuse la clé de production (même sur ce Preview) et les écritures service ne partent pas. La lecture de la fiche déjà liée passe par la session.

Little Emperors, hors production, n’appelle que `https://api-staging.littleemperors.com`. `VERCEL_ENV=preview` et `HOTEL_LE_BOOKING=0` coupent la réservation. La recherche reste possible.

`EXPEDIA_RAPID_ENABLED=1` n’est posé que sur le Preview de la branche Git `staging`. Les clés de test et `https://test.ean.com/v3` sont déjà sur les Preview ; elles ne sont pas recopiées ici.

## DNS à ajouter (non créé)

`staging.travelba.fr` n’est pas attaché au projet. Enregistrement à poser chez le DNS de `travelba.fr`, sans y toucher autrement :

```
staging.travelba.fr.  CNAME  cname.vercel-dns.com.
```

Ensuite, dans Vercel, attacher ce domaine au projet `travelba` avec la branche Git `staging` (cible Preview). Ne pas l’envoyer vers Production.

## Accès

Les Preview sont derrière l’authentification Vercel (compte de l’équipe). Le mot de passe de déploiement est éteint et n’a pas été créé : le poser sur « tous les déploiements » couvrirait `travelba.fr`. Pour Expedia, le poser uniquement sur la cible Preview (`passwordProtection.deploymentType = preview`) dans le tableau de bord Vercel, puis transmettre le mot de passe. Ce n’est pas fait ici.

Comptes de démonstration, base de staging seulement :

- Agence : `revue.agence@travelba.fr` / `RevueAgence2026!`
- Client hôtels : `revue-hotels@travelba.fr` / `RevueHotels2026!`

## Branche Git et adresse

Branche longue durée : `staging`, prise sur la tête de la PR hôtels, pas sur un merge dans `main`.

Elle est poussée seulement après les variables Preview limitées à `gitBranch=staging`. Les autres branches Preview gardent la base de production.

- Adresse en service : `https://travelba-git-staging-travelba.vercel.app`
- Domaine stable, pas encore branché : `staging.travelba.fr` (CNAME ci-dessus, non créé).

Accès pour Expedia : l’authentification Vercel actuelle exige un compte de l’équipe. Pour un relecteur externe, poser un mot de passe de déploiement **uniquement** sur la cible Preview (`passwordProtection.deploymentType = preview`), et transmettre le mot de passe à Expedia. Ne pas l’étendre à `travelba.fr`.

## Variables, cible Preview, branche `staging` seulement

À créer dans Vercel avec `target: preview` et `gitBranch: staging`. Ne pas modifier les variables de Production.

| Variable | Valeur de staging |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lnygnjbvuzgarseqfjlm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon de `lnygnjbvuzgarseqfjlm` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role de `lnygnjbvuzgarseqfjlm` seulement (JWT `role=service_role`, `ref=lnygnjbvuzgarseqfjlm`). Ne pas y mettre la clé de production. |
| `NEXT_PUBLIC_SITE_URL` | `https://staging.travelba.fr` (ou l’alias de branche tant que le DNS n’est pas là) |
| `EXPEDIA_RAPID_ENABLED` | `1` |
| `EXPEDIA_RAPID_ENV` | `test` |
| `EXPEDIA_RAPID_BASE_URL` | `https://test.ean.com/v3` |
| `EXPEDIA_RAPID_API_KEY` / `EXPEDIA_RAPID_SHARED_SECRET` | clés de test déjà prévues pour `test.ean.com` |
| `EXPEDIA_RAPID_TEST` | `standard` pendant la mise au point, `off` pour une revue qui doit voir l’inventaire de test réel |
| `EXPEDIA_SALES_CHANNEL_MODE` | `auto` |
| `HOTEL_LE_BOOKING` | `0` |
| `LITTLE_EMPERORS_API_BASE` | vide, ou `https://api-staging.littleemperors.com` |
| `LITTLE_EMPERORS_API_KEY` | clé de test, jamais la clé de production du 15 octobre 2026 |

`VERCEL_ENV` reste `preview` sur cette branche. Le code coupe déjà la réservation Little Emperors dans ce cas. `HOTEL_LE_BOOKING=0` garde la même coupure si le déploiement n’est plus un Preview.

Ne pas y poser les secrets de production : Revolut live, Stripe live, Pliant, Gmail, Resend de `travelba.fr`, jetons MCP de production.

## Checklist de bascule staging → production

À faire seulement quand Expedia a certifié et que Raphael le demande. Ordre :

1. Merger la branche dans `main`. Ça déploie `https://travelba.fr`.
2. Jouer sur `fsmfozxgujskluxakeoq` les migrations qui ne l’ont pas encore été, dont les trois migrations hôtels. Pas avant ce moment.
3. Variables **Production** seulement :
   - `EXPEDIA_RAPID_ENV=production`
   - `EXPEDIA_RAPID_BASE_URL=https://api.ean.com/v3`
   - remplacer la clé et le secret par ceux de production
   - `EXPEDIA_RAPID_TEST=off`
   - `EXPEDIA_RAPID_ENABLED=1` seulement après la certification
   - ne pas poser `HOTEL_LE_BOOKING=0` : la réservation Little Emperors de production doit rester ouverte
4. Redéployer la production pour prendre les variables `NEXT_PUBLIC_*`.
5. Vérifier un séjour de test, puis un séjour réel, sans seed.

Tant que l’étape 1 n’est pas demandée, `main` et `travelba.fr` ne changent pas.
