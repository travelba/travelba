# Parité admin ↔ MCP

URL : `https://travelba.fr/api/mcp`. Chaque outil suit le rôle de la clé nominative (`crm_mcp_api_keys`). Le jeton général n’est pas filtré par rôle. Les écritures d’une clé sont au journal, au nom du membre. Les actions qui retirent des données exigent `confirmer`. Les numéros de pièce et de carte ne sortent pas, sauf les jetons dédiés.

Légende : **couvert** = le geste admin a déjà un outil. **ajouté** = outil de cette série. **hors API** = volontairement absent, raison en bas.

## Clients, sociétés, accès

| Action admin | Outil MCP |
| --- | --- |
| Créer la fiche | `creer_client` — couvert |
| Modifier la fiche (identité, e-mail, téléphone, commission) | `mettre_a_jour_client`, `modifier_titulaire` — couvert |
| Passeport d’un accompagnateur (numéro, délivrance, expiration, nationalité, naissance, lieu, sexe) | `modifier_titulaire` avec `compagnon_id` — couvert. Le numéro n’est ni renvoyé ni journalisé |
| Renommer un accompagnateur (prénoms, nom, nom d’usage, naissance, sexe) | `mettre_a_jour_accompagnant` — ajouté. Le passeport et les séjours suivent. Le numéro, la délivrance et l’expiration restent |
| Rôle société | `definir_role_societe` — couvert |
| Une société, ou retirer une société vide | `mettre_a_jour_client` — couvert. Avec plusieurs sociétés, un champ sans SIRET est refusé |
| Ajouter une société sans modifier les autres | `ajouter_societe` — ajouté. Les dossiers déjà facturés gardent leur société |
| Modifier une société par identifiant | `modifier_societe` — ajouté. Seuls les champs indiqués changent |
| Lire toutes les sociétés | `fiche_client` (`societes`, identifiant, champs, `principale`) — ajouté |
| Remplacer toute la liste | `enregistrer_societes` (`confirmer` true) — ajouté |
| Supprimer la fiche | `supprimer_client` (`confirmer` = nom complet) — ajouté |
| Inviter / renvoyer l’invitation | `inviter_client` — couvert. Sans `confirmer`, aperçu, rien ne part |
| Montrer le carnet, relevé, pièce visa/ETA, carte d’embarquement | `publier_carnet`, `envoyer_releve`, `ajouter_piece`, `notifier_piece`, `notifier_carte_embarquement` — sans `confirmer`, aperçu, rien n’est écrit et rien ne part |
| Renvoyer ses accès par WhatsApp | `renvoyer_acces_whatsapp` (`confirmer: true`) — ajouté. Un bouton, Ouvrir mon espace : lien personnel 30 jours (empreinte seulement), aucun mot de passe, le lien n’est pas renvoyé |
| Annoncer l’accès Hôtels | `annoncer_option_hotel` (`confirmer: true`) — ajouté. Même lien, vers la rubrique Hôtels. Réservé aux administrateurs. L’option doit déjà être activée |
| Accès Hôtels, mode réel, réservation directe par l’API, accepter ou refuser une demande | `regler_acces_hotels` — ajouté |
| Relevé WhatsApp | `envoyer_releve` — couvert |
| Créer la fiche dans MB3M | `creer_fiche_mb3m` — ajouté |
| Ouvrir l’espace à la place du client | hors API |
| Lien d’accès magique 24 h (mot de passe déjà posé) | hors API — le bouton « Envoyer un lien d’accès » reste à l’écran |
| Compte en veille, IBAN, téléphone secondaire, fidélité | partiel : pas de champ dédié sur `mettre_a_jour_client` |
| Retirer un accompagnateur de la fiche | `supprimer_compagnon` (`confirmer` = nom complet) — ajouté. Réservé aux administrateurs. Pièces d’identité et fichiers compris. S’il est voyageur, refus en listant les dossiers, sauf `retirer_des_dossiers` true (lignes voyageur seulement). Réservations, paiements, factures et grand livre inchangés |

## Dossiers et cartes

| Action admin | Outil MCP |
| --- | --- |
| Créer un séjour caché | `creer_dossier` — couvert |
| Titre, dates, notes, société, couverture, statut | `mettre_a_jour_dossier` — couvert. `statut` : non_visible, visible, annule (anciens mots acceptés) |
| Annuler un débit manuel | `annuler_mouvement` — couvert |
| Fusionner deux fiches | `fusionner_clients` — couvert |
| Montrer au client | `publier_carnet` — couvert |
| Cacher le carnet | `cacher_carnet` — ajouté |
| Archiver / rouvrir / dupliquer | `archiver_dossier`, `restaurer_dossier`, `dupliquer_dossier` — ajouté |
| Supprimer un dossier créé par erreur | `supprimer_dossier` — ajouté. `dossier_id` ou `reference`, `confirmer` true. Retire le relevé, `crm_hotel_direct_stays` et `crm_le_bookings`. Refus si la carte Pliant n’est pas gelée. |
| Voyageurs du dossier | `ajouter_voyageur`, `modifier_voyageur`, `retirer_voyageur`, `fusionner_compagnon` — couvert |
| Changer le client du dossier | `changer_client_dossier` — ajouté. Sans `confirmer`, aperçu. Crée la fiche si besoin, sans invitation. Voyageurs qui sont l’ancien client, grand livre, paiements et payeur de ce dossier suivent. Aucun message. |
| Vol, hôtel, accueil VIP | `ajouter_vol`, `modifier_vol`, `ajouter_hotel`, `modifier_hotel`, `ajouter_accueil_vip` — couvert |
| Classer un courrier hôtel sans écrire | `classer_courrier_hotel` — ajouté. `rouvrir` true rouvre. Aucun e-mail. Un message entrant plus récent rouvre le fil |
| Train, transfert, activité, frais, dépense, autres types | `ajouter_carte`, `modifier_carte` — ajouté |
| Visibilité d’une carte, inclusion au grand livre | `definir_visibilite_carte` — couvert |
| Retirer une carte | `retirer_carte` — couvert |
| Réordonner les étapes | `reordonner_cartes` — ajouté |
| Confirmer chauffeur, VIP, enregistrement | `confirmer_service` — couvert |
| Statut d’enregistrement des vols | `enregistrement_en_ligne` — couvert |
| Brouillon WhatsApp d’un ajout | `preparer_message_carnet` — couvert, n’envoie pas |
| Demander ou annuler une option (extras), devis chauffeur | hors API |
| Responsable du dossier, partage WhatsApp accompagnateur | hors API |
| Import PDF / photos (lire, créer ou compléter) | `importer_pieces` — ajouté. Sans `confirmer`, aperçu (titre, dates, voyageurs, cartes). `confirmer` true crée un dossier caché (`client_id`) ou complète le séjour (`dossier_id`). Une annulation ne crée pas de dossier |
| Services proposés (`offer_*`), destination, devise, titulaire facturé | partiel dans `mettre_a_jour_dossier` |

## Fichiers

| Action admin | Outil MCP |
| --- | --- |
| Pièce du coffre client (visa, ETA, passeport, assurance) | `ajouter_piece`, `requalifier_piece`, `notifier_piece` — couvert. Un passeport écrit la délivrance quand elle est fournie ou lue sur le fichier |
| Carte d’embarquement déjà déposée | `notifier_carte_embarquement` — couvert |
| Fichier sur le dossier ou sur une carte | `deposer_piece_dossier` — ajouté |
| Retirer cette pièce | `retirer_piece_dossier` — ajouté |
| Retirer une pièce d’identité de la fiche (titulaire ou compagnon) | `supprimer_piece_client` (`confirmer` true) — ajouté. Réservé aux administrateurs. Le fichier part avec la ligne. Jamais le numéro, au plus les trois derniers caractères (`fin`) |
| Lecture du numéro ou du scan de passeport | `passeport_voyageur`, `scan_passeport` — jeton passeport seulement. `scan_passeport` accepte un dossier, ou `client_id` avec `voyageur_id` ou `compagnon_id` sans dossier. URL signée dix minutes. Lecture seule, aucun message |
| OCR « Mal lu » sur la fiche | hors API |

## Finances, factures, fournisseurs

| Action admin | Outil MCP |
| --- | --- |
| Grand livre, encours, comptabilité voyage | `grand_livre`, `comptabilite_voyage` — couvert. Chaque coût (`lignes.couts` et `couts_sans_vente`) porte `cout_id` et `sortie_id` |
| Créditer Revolut, Stripe, virement | `crediter_revolut` (aussi une ligne de versement Stripe, brut ; frais non crédités), `crediter_stripe`, `crediter_virement` — couvert |
| Compléter le nom et l’e-mail Stripe | `completer_payeurs_stripe` — ajouté. Sans `confirmer`, aperçu. Écrit seulement le nom et l’e-mail, sans crédit. Réservé aux administrateurs |
| Rapprocher une sortie Revolut ou un débit Pliant (geste simple) | `rapprocher_depense_revolut`, `rapprocher_pliant` — couvert |
| Remettre un crédit non rattaché | `remettre_non_rattache` — couvert |
| Préparer / lire la facture MB3M | `preparer_facture_mb3m`, `statut_facture_mb3m` — couvert. `preparer_facture_mb3m` : sans `confirmer`, aperçu, aucune pièce |
| Envoyer la facture et demander le paiement | `envoyer_facture` — ajouté. Sans `confirmer`, aperçu seulement |
| Avoir et nouvelle facture (marge périmée) | `reprendre_facture_mb3m` — ajouté. Sans `confirmer`, aperçu, aucun avoir |
| Créditer un virement, Revolut ou Stripe | `crediter_virement`, `crediter_revolut`, `crediter_stripe` — sans `confirmer`, aperçu, rien n’est écrit |
| Créer une carte Pliant | `creer_carte_pliant` — sans `confirmer`, aperçu, la carte n’est pas créée |
| Créer la fiche client dans MB3M | `creer_fiche_mb3m` — ajouté |
| Refuser un encaissement Revolut ou Stripe | `refuser_encaissement` — ajouté |
| Détacher, déplacer, refuser, hors voyage, nouvelle dépense, changer de ligne | `comptabilite_sortie` — ajouté. `detacher` accepte `cout_id`, ou `sortie_id` seul (et `dossier_id`) quand un seul coût est lié |
| Compte de facturation sur un crédit | partiel |
| Raccourcis du bloc Dépenses | `depenses_types` — ajouté. Réservé aux administrateurs. Sans `enregistrer`, lecture. `enregistrer` true remplace la liste. Un raccourci posé sur un dossier est une dépense libre. `billeterie` refuse le doublon avec les frais automatiques, qui restent en place |
| Sync Revolut / Pliant, OAuth Revolut | hors API |

## Mails, journal, équipe

| Action admin | Outil MCP |
| --- | --- |
| File fournisseurs, lire un mail | `emails_en_attente`, `lire_email` — couvert |
| Déposer les pièces, mettre à jour, refuser, créer un dossier | `traiter_email` — couvert |
| Courrier type à l’hôtel, relance, réponse, Pas besoin / Remettre | `courrier_hotel`, `relancer_hotel`, `repondre_hotel`, `demande_hotel` — ajouté. Sans `confirmer`, aperçu (destinataires, objet, corps). `confirmer` true envoie, ou enregistre Pas besoin / Remettre sans e-mail |
| Détacher un mail du mauvais séjour | `detacher_email` — ajouté. Sans `confirmer`, aperçu (cartes, pièces, voyageurs, dossier retiré). `confirmer` true retire et remet le mail en file. Un mail bloqué n’est pas retiré |
| Billet déposé transformé en carte vol | `deposer_billet` — ajouté. Sans `confirmer`, aperçu (PNR, prix, création ou mise à jour). `confirmer` true écrit la carte et dépose le fichier. Sans PNR et sans carte, refus |
| Classer (ignorer), doublon, remettre un mail | hors API |
| Journal (fiche ou agence) | `lire_journal` — ajouté. Pas d’export CSV |
| Recherches Hôtels de l’espace client | `recherches_hotels` — ajouté. Client et dates. Résumé, heure, lien fiche. Pas de prix net ni de marge |
| Membres et clés | `lister_membres`, `ajouter_membre`, `changer_role_membre`, `desactiver_membre`, `lister_cles_api`, `creer_cle_api`, `revoquer_cle_api` — couvert |
| Rouvrir un accès coupé | `reactiver_membre` — ajouté |
| Départ (réattribuer les dossiers), sessions, matrice des droits | hors API |
| Restaurants du catalogue et tables du soir | `list_restaurants`, `create_restaurant`, `update_restaurant`, `tables_restaurant`, `choix_restaurant`, `sejours_restaurants` — couvert |
| Envoyer le WhatsApp 16 h, modèles | `create_restaurant_whatsapp_templates`, `get_restaurant_whatsapp_templates_status` — le dépôt des modèles est couvert ; l’envoi du soir reste le cron |
| Déposer espace_client_lien, option_hotel_activee, facture_paiement | `deposer_modeles_whatsapp`, `statut_modeles_whatsapp` — ajouté. Administrateurs. Le SID est dans `crm_whatsapp_content_sids`, repli sur la variable |
| Déposer autorisation_validee_document_v2 et autorisation_validee_image_v2 | `deposer_modeles_autorisation_whatsapp`, `statut_modeles_autorisation_whatsapp` — ajouté. Administrateurs. La v2 nomme l’autorisation. L’envoi l’utilise dès approbation, sinon la v1. Même réglage, repli `TWILIO_CONTENT_AUTORISATION_VALIDEE_*` et `_V2`. Un envoi v1 ou v2 compte. Aucun message |
| Message WhatsApp libre, avec PDF déjà déposé | `envoyer_message_libre`, `deposer_modeles_message_libre_whatsapp`, `statut_modeles_message_libre_whatsapp` — ajouté. Sans `confirmer`, aperçu. `confirmer` true envoie. Fenêtre de 24 h : texte tel quel. Hors fenêtre : `message_libre_texte`, `message_libre_document` ou `message_libre_image`. SID dans `crm_whatsapp_content_sids`. Pas le modèle d’autorisation. Un passeport ne part pas |
| Little Emperors | `reservation_little_emperors`, `little_emperors_en_attente` — couvert. `importer_reservation_little_emperors` crée ou rattache le dossier (`client_id`, `reference` ou `regroupement`, `dossier_id` ou `dossier_reference`, `voyageurs`, `forcer`). Le dossier créé reste Non visible, aucun message. Un dossier déjà Visible n’est pas recaché. Montrer au client ou `publier_carnet` le passe en Visible et prévient le client. Annulée ou en échec : refus, sauf `forcer`. Déjà liée ailleurs : refus, avec le dossier |
| Cartes Pliant du dossier | `creer_carte_pliant`, `lire_carte_pliant`, `bloquer_carte_pliant` — jeton carte pour le numéro |
| Plafond et clôture d’une carte Pliant | `modifier_plafond_pliant`, `cloturer_carte_pliant` — ajouté. Sans `confirmer`, aperçu. `confirmer` true change le plafond ou clôture. Ce n’est pas un gel |
| Formalités (lecture) | `formalites` — couvert |
| Lancer, remplir ou payer une formalité (ESTA, ETA, visa) | `lancer_formalite` — lancer couvert. `statut_formalite` lit le parcours. Le remplissage du portail et le paiement restent à l’écran |
| Répondre sur WhatsApp, valider une proposition Concierge | hors API — envoie un message |
| Réglages Gmail, WhatsApp, mot de passe staff, connexion | hors API |

## Hors API, et pourquoi

- **OAuth, sync bancaire, diagnostics, mot de passe, connexion.** Ce sont des réglages d’infrastructure, pas des gestes dossier.
- **Numéro de passeport et PAN.** Ils restent sur `TRAVELBA_MCP_PASSPORT_TOKENS` et `TRAVELBA_MCP_CARD_TOKENS`. Une clé nominative ne les ouvre pas.
- **Messages libres** (réponse hôtel, partage, formalité qui part au client). Le connecteur prépare (`preparer_message_carnet`, `traiter_email`) ; ces envois restent un clic humain. Le WhatsApp rédigé par l’agence, avec une pièce déjà déposée, est `envoyer_message_libre` : sans `confirmer`, rien ne part.
- **Réservation Ratehawk, remplissage de portail visa, paiement de la formalité.** Le lancement est `lancer_formalite`. Le remplissage du portail et le paiement restent des parcours longs, tenus par l’écran. L’import PDF ou photo est `importer_pieces`.
- **Ouvrir l’espace client à la place du client.** Cela crée une session sur le poste de l’agence. Ce n’est pas un outil. Le renvoi des accès au client, lui, est `renvoyer_acces_whatsapp`.
- **Export CSV du journal.** Le droit d’export et le volume de données restent sur l’écran.

`renvoyer_acces_whatsapp` ajoute `crm_access_resend_tokens` : empreinte du jeton seulement, 30 jours, usage unique, révoqué par un nouvel envoi du même geste. `annoncer_option_hotel` ouvre la rubrique Hôtels avec le même jeton.

## Facture pro forma

`envoyer_facture` est le bouton **Envoyer la facture et demander le paiement**.

- Sans `confirmer`, l’outil renvoie l’aperçu : numéro, reste à payer, échéance, RIB présent ou manquant, lien Stripe s’il existe, message, canaux prêts. Rien ne part.
- `confirmer: true` envoie. `email` et `whatsapp` valent vrai par défaut ; `false` retire le canal.
- Le PDF est joint. Le message porte le reste dû, le RIB et le lien de paiement.
- Hors fenêtre de 24 h, WhatsApp exige le modèle Utility `facture_paiement` (`TWILIO_CONTENT_FACTURE`, en-tête Document). Tant qu’il n’est pas approuvé, le canal est refusé et la réponse décrit le modèle à soumettre à Meta. `scripts/arm-whatsapp-concierge.ts` le dépose avec les autres modèles.
- L’envoi est écrit dans le journal d’agence, avec l’auteur (le jeton, ou le membre de la clé nominative).
- Un second envoi réussi dans les cinq minutes est refusé, sauf `force`.
- `lien_stripe` enregistre un lien déjà émis. L’outil n’en crée pas.

Le même envoi est `POST /api/admin/bookings/{id}/facture` avec `confirmer: true`, après l’aperçu.

La facture client ajoute les tables `crm_invoice_settings` (RIB de repli, délai) et `crm_booking_pay_links` (lien Stripe déjà émis).
