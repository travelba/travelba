# Staging Travelba

Environnement de travail et de démonstration pour Expedia (site review et certification B2B Rapid). Il n’est pas la production. La bascule se fait en changeant des clés et des variables, puis en jouant les migrations sur la base de production au moment voulu.

Rien dans ce document n’autorise à merger `main`, à écrire dans la base `fsmfozxgujskluxakeoq`, ni à modifier une variable Vercel de **Production**.

## État au 20 novembre 2026

Le staging n’est pas encore en ligne. La base isolée n’a pas été créée : elle a un coût, et Raphael doit l’accepter avant.

Ce qui est déjà vrai :

- Les déploiements Preview du projet Vercel `travelba` (`prj_NAEfKYyndp7T68G2wKOguSCgtPUr`) sont couverts par l’authentification Vercel (`ssoProtection`, cible Preview). Le mot de passe de déploiement est éteint. Le domaine de production `travelba.fr` n’est pas derrière cette protection.
- Il n’existe aucune branche Supabase sur `fsmfozxgujskluxakeoq`. Le dépôt et le lancement production ne connaissent qu’une base CRM : `fsmfozxgujskluxakeoq`. Les Preview qui partagent ces variables lisent et écrivent donc cette base de production. Aucune migration de la PR hôtels n’y a été jouée.
- Little Emperors, hors production, n’appelle que `https://api-staging.littleemperors.com`. Un Preview qui aurait l’adresse de production est refusé par le code. En plus, `VERCEL_ENV=preview` coupe la réservation (e-mail direct et API) via `hotelLeBookingFrozen`. La recherche reste possible.
- Les clés `EXPEDIA_RAPID_*` présentes sur Vercel pointent `https://test.ean.com/v3` et `EXPEDIA_RAPID_ENV=test`, y compris sur la cible Production. `EXPEDIA_RAPID_ENABLED` n’est pas posé : Expedia ne part pas tant qu’il ne vaut pas `1`.
- Les checks de la PR #799 (`typecheck · lint · tests · migrations`) sont verts sur `22ba24cf`.

## Ce que Raphael doit accepter avant la suite

Deux façons d’isoler la base. Les deux ont un prix. Aucune n’a été lancée.

| Option | Prix relevé | Données |
|---|---|---|
| Branche Supabase persistante sur `fsmfozxgujskluxakeoq`, nom `staging` | 0,01344 USD de l’heure, tant que la branche tourne | Le schéma des migrations seulement. Les données de production ne sont pas copiées. |
| Nouveau projet Supabase, par exemple `travelba-staging`, région `eu-west-1` | 10 USD par mois | Base vide. |

La branche est le bon choix pour une démo Expedia : pas de fiches clients, et les migrations du dépôt s’y appliquent. Il faudra ensuite un jeu de démonstration (un compte staff, un client fictif `revue-hotels@travelba.fr`, l’accès Hôtels), sans copie de la production.

Après l’accord écrit sur le prix :

1. Créer la branche ou le projet.
2. Jouer les migrations du dépôt, y compris `20261121100000`, `20261121110000` et `20261121120000`.
3. Ne pas lancer `npm run seed:demo` s’il vise la production. Le seed de démo ne va que sur la base de staging.

## Branche Git et adresse

Branche longue durée : `staging`, prise sur la tête de la PR hôtels, pas sur un merge dans `main`.

Elle n’est pas poussée tant que la base isolée n’existe pas. Un push ouvrirait un Preview Vercel qui, aujourd’hui, utiliserait la base de production.

Adresse prévue, une fois la base branchée :

- Domaine stable : `staging.travelba.fr`. Il faut un enregistrement DNS (CNAME vers `cname.vercel-dns.com`, ou le CNAME indiqué par Vercel) sur le domaine déjà chez l’équipe. Personne ne l’a créé.
- En attendant le DNS : l’alias de branche `https://travelba-git-staging-travelba.vercel.app`.

Accès pour Expedia : l’authentification Vercel actuelle exige un compte de l’équipe. Pour un relecteur externe, poser un mot de passe de déploiement **uniquement** sur la cible Preview (`passwordProtection.deploymentType = preview`), et transmettre le mot de passe à Expedia. Ne pas l’étendre à `travelba.fr`.

## Variables, cible Preview, branche `staging` seulement

À créer dans Vercel avec `target: preview` et `gitBranch: staging`. Ne pas modifier les variables de Production.

| Variable | Valeur de staging |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de la branche ou du projet de staging |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon de cette base |
| `SUPABASE_SERVICE_ROLE_KEY` | service role de cette base |
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
