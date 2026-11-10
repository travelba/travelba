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

Passeports et le numéro complet d’une carte restent sur les jetons d’environnement dédiés. Une clé nominative ne lit pas le numéro. Elle peut créer ou geler une carte si son rôle a le droit « Créer une carte Pliant ». Le jeton général `TRAVELBA_MCP_TOKEN` peut créer et geler, sans lire le numéro. `lire_carte_pliant` reste `TRAVELBA_MCP_CARD_TOKENS`.

Première clé : un administrateur crée la clé de `raphael@travelba.fr` (rôle admin) depuis Clés API, après que ce membre existe dans Équipe.
