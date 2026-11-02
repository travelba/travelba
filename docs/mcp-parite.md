# Parité MCP

Chaque geste du back-office a un outil dans `lib/crm/mcp-registry.ts`. Le plafond est 73.

## Facture pro forma

`preparer_facture_mb3m` prépare la pièce. `statut_facture_mb3m` la lit. Ces deux outils parlent à l’outil de facturation de l’agence. Le client ne voit pas ce nom.

`envoyer_facture` est le bouton **Envoyer la facture et demander le paiement**.

- Sans `confirmer`, l’outil renvoie l’aperçu : numéro, reste à payer, échéance, RIB présent ou manquant, lien Stripe s’il existe, message, canaux prêts. Rien ne part.
- `confirmer: true` envoie. `email` et `whatsapp` valent vrai par défaut ; `false` retire le canal.
- Le PDF est joint. Le message porte le reste dû, le RIB et le lien de paiement.
- Hors fenêtre de 24 h, WhatsApp exige le modèle Utility `facture_paiement` (`TWILIO_CONTENT_FACTURE`, en-tête Document). Tant qu’il n’est pas approuvé, le canal est refusé et la réponse décrit le modèle à soumettre à Meta.
- L’envoi est écrit dans le journal d’agence, avec l’auteur (le jeton, ou le membre de la clé nominative).
- Un second envoi réussi dans les cinq minutes est refusé, sauf `force`.
- `lien_stripe` enregistre un lien déjà émis. L’outil n’en crée pas.

Le même envoi est `POST /api/admin/bookings/{id}/facture` avec `confirmer: true`, après l’aperçu.
