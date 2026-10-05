# Configurateur Argentine

Séjour de 19 jours (J1–J19) pour un couple, juillet–août : hébergement, une activité par jour, transfert entre les étapes. Le total en dollars se met à jour pour 2 adultes et 1 chambre.

Les prix viennent de `data/seed.json`. EOLO (El Calafate) est fermé sur cette saison et n’est pas proposé. Les transferts n’ont pas de tarif dans le seed : ils restent sur devis et n’entrent pas dans le total chiffré.

Les fiches (texte, photos) sont lues uniquement sur les URL officielles du seed, puis mises en cache dans `cache/`. Si une photo échoue, le tarif catalogue reste affiché.

## Lancer

```bash
cd configurateur-argentine
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Autres commandes

```bash
npm test
npm run typecheck
npm run fetch:fiches
```

`npm run fetch:fiches` précharge les textes et photos officiels. Ce n’est pas nécessaire pour calculer un séjour : l’écran interroge `/api/fiche` à la demande.
