# Clé MCP nominative

Chaque personne de l’agence branche son assistant avec sa propre clé. Le jeton partagé `TRAVELBA_MCP_TOKEN` et les jetons passeport / carte restent acceptés.

URL : `https://travelba.fr/api/mcp`

En-tête : `Authorization: Bearer tbk_xxxxxxxx_…`

Exemple :

```json
{
  "mcpServers": {
    "travelba": {
      "url": "https://travelba.fr/api/mcp",
      "headers": {
        "Authorization": "Bearer tbk_xxxxxxxx_…"
      }
    }
  }
}
```

La clé en clair n’apparaît qu’une fois, à la création (`/admin/cles`, réservé aux administrateurs, ou l’outil `creer_cle_api`). Seuls le préfixe et l’empreinte sont enregistrés. Une clé révoquée, expirée, ou portée par un accès coupé, est refusée tout de suite.

Les actions faites avec la clé sont au nom du membre (historique du dossier : son nom) et suivent son rôle. Les outils d’équipe et de clés (`lister_membres`, `ajouter_membre`, `changer_role_membre`, `desactiver_membre`, `lister_cles_api`, `creer_cle_api`, `revoquer_cle_api`) sont réservés aux administrateurs. Un agent reçoit « Réservé aux administrateurs. »

Les passeports restent sur le jeton d’environnement dédié. Une clé nominative lit le numéro d’une carte (`lire_carte_pliant` : numéro, expiration, CVV, titulaire) seulement si son rôle a le droit « Créer une carte Pliant ». Le même droit lui permet de créer ou de geler. Sans ce droit, la lecture est refusée. Le jeton général `TRAVELBA_MCP_TOKEN` peut créer, geler et lire le numéro, comme un jeton de `TRAVELBA_MCP_CARD_TOKENS`. La création ne renvoie pas le numéro : la lecture suit, et elle est journalisée sans l’enregistrer.

Première clé : un administrateur crée la clé de `raphael@travelba.fr` (rôle admin) depuis Clés API, après que ce membre existe dans Équipe.
