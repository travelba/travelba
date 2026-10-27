import { clientWriteHandsOff, parseClientSpaceWrite } from "@/lib/crm/concierge-client-write";

/**
 * Chaque geste de l’espace client, et l’outil du concierge qui le reprend.
 * Même règle, même refus. Une route nouvelle sans ligne ici casse le test.
 */
export type ClientSpaceAction = {
  id: string;
  page: string;
  route: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Ce que le client fait. */
  client: string;
  /** Outil du concierge. */
  concierge: string;
  /** La limite, la même des deux côtés. */
  rule: string;
};

export const CLIENT_SPACE_ACTIONS: ClientSpaceAction[] = [
  {
    id: "lire_voyageurs",
    page: "/mon-compte/profil/compagnons",
    route: "/api/client/companions",
    method: "GET",
    client: "Lit les accompagnateurs de la fiche.",
    concierge: "lire_voyageurs",
    rule: "Le concierge répond avec les voyageurs déjà sur les séjours de l’expéditeur. Pas un autre client.",
  },
  {
    id: "ajouter_accompagnateur",
    page: "/mon-compte/profil/compagnons",
    route: "/api/client/companions",
    method: "POST",
    client: "Ajoute un accompagnateur (nom, téléphone, e-mail de contact, naissance). Pas de compte.",
    concierge: "ajouter_accompagnateur",
    rule: "Nom et prénom requis. L’e-mail n’ouvre pas de compte. Le titulaire seulement.",
  },
  {
    id: "modifier_accompagnateur",
    page: "/mon-compte/profil/compagnons",
    route: "/api/client/companions",
    method: "PATCH",
    client: "Modifie un accompagnateur déjà là.",
    concierge: "modifier_voyageur",
    rule: "Par voyageur_id du séjour, pas par compagnon_id. Même champs que le formulaire.",
  },
  {
    id: "retirer_accompagnateur",
    page: "/mon-compte/profil/compagnons",
    route: "/api/client/companions",
    method: "DELETE",
    client: "Retire un accompagnateur et ses pièces.",
    concierge: "retirer_accompagnateur",
    rule: "Le titulaire seulement. Pas le titulaire lui-même. Les pièces de cette personne partent avec lui.",
  },
  {
    id: "journal_visite",
    page: "/mon-compte",
    route: "/api/client/activity",
    method: "POST",
    client: "Note une page ouverte ou la déconnexion du navigateur.",
    concierge: "journal_visite",
    rule: "Le fil WhatsApp n’est pas la session du navigateur. La déconnexion du cookie ne se fait pas d’ici.",
  },
  {
    id: "facturer_sejour",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/billing-company",
    method: "PATCH",
    client: "Choisit la société qui facture un séjour visible.",
    concierge: "facturer_sejour",
    rule: "Séjour visible, société du compte. Un collaborateur membre ne change pas la facturation société.",
  },
  {
    id: "agenda_sejour",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/calendrier",
    method: "GET",
    client: "Télécharge l’agenda du séjour publié.",
    concierge: "agenda_sejour",
    rule: "Même fichier que le carnet visible. Horaires seulement s’ils sont déjà écrits. Lien vers l’espace.",
  },
  {
    id: "devis_chauffeur",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/chauffeur-quote",
    method: "POST",
    client: "Demande un devis de transfert, sans réserver.",
    concierge: "devis_chauffeur",
    rule: "Séjour visible, trajet indiqué. Le concierge ne choisit pas un véhicule à la place du client.",
  },
  {
    id: "demander_service",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/extras",
    method: "POST",
    client: "Demande, modifie ou retire un transfert, un VIP Airport, un enregistrement ou un visa.",
    concierge: "demander_service",
    rule: "Même validation que le bouton : vol requis, service proposé, véhicule choisi pour un chauffeur. L’agence est prévenue comme aujourd’hui.",
  },
  {
    id: "import_dossier",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/from-ingest",
    method: "POST",
    client: "L’import d’un dossier depuis un PDF est refusé.",
    concierge: "import_agence",
    rule: "Même refus : l’import de documents se fait uniquement par l’agence.",
  },
  {
    id: "annuler_hotel",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/hotel-cancel",
    method: "POST",
    client: "Annule un hôtel Little Emperors si c’est gratuit.",
    concierge: "annuler_hotel",
    rule: "Titulaire seulement. Relu chez Little Emperors juste avant. Sinon « Contactez votre conseiller. » Un compagnon ou l’équipe ne l’annule pas.",
  },
  {
    id: "carte_hotel",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/hotel-card",
    method: "POST",
    client: "Ne peut pas lire la carte hôtel.",
    concierge: "carte_hotel_agence",
    rule: "Même refus : la carte hôtel reste à l’agence.",
  },
  {
    id: "partager_carnet",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/partage",
    method: "POST",
    client: "Envoie le lien du carnet publié à un accompagnateur.",
    concierge: "partager_carnet",
    rule: "Séjour publié, accompagnateur du séjour, téléphone déjà sur la fiche. Rien ne part sans ce clic.",
  },
  {
    id: "reglement_sejour",
    page: "/mon-compte/transactions",
    route: "/api/client/bookings/[id]/pay",
    method: "POST",
    client: "Cette route ne règle plus rien.",
    concierge: "reglement_espace",
    rule: "Même texte : le règlement se fait dans Transactions.",
  },
  {
    id: "formalite",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/visa",
    method: "POST",
    client: "Répond et confirme une formalité ETA-IL, ESTA ou Royaume-Uni.",
    concierge: "formalite_client",
    rule: "Les réponses se confirment dans l’espace, sur le formulaire. Le concierge ne soumet pas la formalité sans ces réponses.",
  },
  {
    id: "deposer_formalite",
    page: "/mon-compte/reservations/[reference]",
    route: "/api/client/bookings/[id]/visas",
    method: "POST",
    client: "Dépose les fichiers d’une formalité déjà due.",
    concierge: "deposer_formalite",
    rule: "Séjour visible, formalité déjà due. Sans formalité : même refus. Aucun numéro dans le journal.",
  },
  {
    id: "import_nouveau",
    page: "/mon-compte/reservations",
    route: "/api/client/bookings/from-ingest",
    method: "POST",
    client: "L’import d’un nouveau dossier est refusé.",
    concierge: "import_agence",
    rule: "Même refus : l’import de documents se fait uniquement par l’agence.",
  },
  {
    id: "import_piece_dossier",
    page: "/mon-compte/reservations",
    route: "/api/client/bookings/ingest",
    method: "POST",
    client: "L’import dropzone est refusé.",
    concierge: "import_agence",
    rule: "Même refus : l’import de documents se fait uniquement par l’agence.",
  },
  {
    id: "lire_pieces",
    page: "/mon-compte/profil/documents",
    route: "/api/client/documents",
    method: "GET",
    client: "Lit le coffre.",
    concierge: "lire_pieces",
    rule: "Le concierge dit quelles pièces sont là, sans numéro et sans MRZ.",
  },
  {
    id: "deposer_piece",
    page: "/mon-compte/profil/documents",
    route: "/api/client/documents",
    method: "POST",
    client: "Dépose une pièce ou un passeport après relecture.",
    concierge: "deposer_piece",
    rule: "Le fichier reçu est rangé sur la personne nommée. Le numéro et la MRZ ne sont ni répétés ni journalisés.",
  },
  {
    id: "retirer_piece",
    page: "/mon-compte/profil/documents",
    route: "/api/client/documents",
    method: "DELETE",
    client: "Retire une pièce du coffre.",
    concierge: "retirer_piece",
    rule: "Une seule pièce de ce type pour cette personne. Sinon le coffre. Jamais par le numéro.",
  },
  {
    id: "lire_piece",
    page: "/mon-compte/profil/documents",
    route: "/api/client/documents/scan",
    method: "POST",
    client: "Lit une pièce, puis le client confirme les champs.",
    concierge: "lire_piece",
    rule: "La confirmation des champs reste le geste du coffre. Le concierge ne recopie pas le numéro.",
  },
  {
    id: "acces_hotels",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/acces",
    method: "POST",
    client: "Demande l’accès à la réservation d’hôtels.",
    concierge: "acces_hotels",
    rule: "Même demande que le bouton. Si l’accès est déjà ouvert, rien n’est redemandé.",
  },
  {
    id: "demande_hotel",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/demandes",
    method: "POST",
    client: "Confie une offre déjà choisie à l’agence.",
    concierge: "demande_hotel",
    rule: "Il faut une offre encore ouverte, comme à l’écran. Sinon la même erreur, et l’espace Hôtels.",
  },
  {
    id: "fiche_hotel",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/fiche",
    method: "POST",
    client: "Ouvre la fiche d’une offre.",
    concierge: "fiche_hotel",
    rule: "Réservé au compte qui a l’accès hôtels. L’offre se choisit dans l’espace.",
  },
  {
    id: "reserver_hotel",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/reserver",
    method: "POST",
    client: "Réserve une offre, carte ou agence.",
    concierge: "reserver_hotel",
    rule: "La carte se confirme dans l’espace (Stripe). Sans offre choisie : même refus.",
  },
  {
    id: "recherche_hotel",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/search",
    method: "POST",
    client: "Cherche des hôtels.",
    concierge: "recherche_hotel",
    rule: "Même accès que l’écran. La recherche et le choix de l’offre se font dans Hôtels.",
  },
  {
    id: "sejour_direct",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/sejour",
    method: "POST",
    client: "Annule ou interroge un séjour réservé en direct.",
    concierge: "sejour_direct",
    rule: "Le séjour direct se désigne dans Hôtels. Sans identifiant : même refus.",
  },
  {
    id: "suggerer_hotel",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/suggest",
    method: "GET",
    client: "Suggère des villes d’hôtels.",
    concierge: "suggerer_hotel",
    rule: "Les suggestions restent celles de l’écran Hôtels.",
  },
  {
    id: "voyageurs_hotel",
    page: "/mon-compte/hotels",
    route: "/api/client/hotels/voyageurs",
    method: "GET",
    client: "Liste les voyageurs proposés pour une chambre.",
    concierge: "lire_voyageurs",
    rule: "Mêmes personnes que la fiche, sur les séjours de l’expéditeur.",
  },
  {
    id: "regler_encours",
    page: "/mon-compte/transactions",
    route: "/api/client/ledger/pay",
    method: "POST",
    client: "Règle l’encours par carte ou virement, dans la page.",
    concierge: "regler_encours",
    rule: "Le paiement se confirme dans Transactions. Un collaborateur membre ne règle pas le compte société. Rien n’est encaissé dans le fil.",
  },
  {
    id: "lire_releve",
    page: "/mon-compte/transactions",
    route: "/api/client/ledger/releve",
    method: "GET",
    client: "Télécharge le relevé.",
    concierge: "releve_transactions",
    rule: "Même relevé que la page. Le concierge l’envoie sur WhatsApp si le client le demande.",
  },
  {
    id: "envoyer_releve",
    page: "/mon-compte/transactions",
    route: "/api/client/ledger/releve",
    method: "POST",
    client: "Reçoit le relevé sur WhatsApp.",
    concierge: "releve_transactions",
    rule: "Même envoi, même plafond horaire, même téléphone de la fiche.",
  },
  {
    id: "bienvenue",
    page: "/mon-compte/bienvenue",
    route: "/api/client/onboarding",
    method: "POST",
    client: "Marque la bienvenue comme vue, après le mot de passe.",
    concierge: "bienvenue",
    rule: "La bienvenue est l’écran de l’espace. Le mot de passe n’est pas choisi dans le fil.",
  },
  {
    id: "mot_de_passe",
    page: "/mon-compte/profil",
    route: "/api/client/password",
    method: "POST",
    client: "Choisit son mot de passe dans le formulaire.",
    concierge: "mot_de_passe",
    rule: "Le mot de passe se tape dans l’espace. Le lien envoyé n’est pas un mot de passe, et aucun mot n’est enregistré depuis le fil.",
  },
  {
    id: "carte_defaut",
    page: "/mon-compte/profil/facturation",
    route: "/api/client/payment-methods",
    method: "PATCH",
    client: "Choisit la carte par défaut.",
    concierge: "carte_defaut",
    rule: "Une seule carte, ou les quatre derniers chiffres. Sinon Facturation. Aucun numéro complet.",
  },
  {
    id: "retirer_carte",
    page: "/mon-compte/profil/facturation",
    route: "/api/client/payment-methods",
    method: "DELETE",
    client: "Retire une carte enregistrée.",
    concierge: "retirer_carte_paiement",
    rule: "La carte désignée par ses quatre derniers chiffres, sur ce compte seulement. Sinon Facturation.",
  },
  {
    id: "modifier_fiche",
    page: "/mon-compte/profil",
    route: "/api/client/profile",
    method: "PATCH",
    client: "Met à jour la fiche : identité, téléphones, adresse, fidélité, IBAN, facturation.",
    concierge: "modifier_fiche",
    rule: "Pas l’e-mail de connexion. Pas le rôle société, pas le plafond. L’IBAN n’est pas répété.",
  },
  {
    id: "enregistrer_carte",
    page: "/mon-compte/profil/facturation",
    route: "/api/client/stripe/setup-intent",
    method: "POST",
    client: "Commence l’enregistrement d’une carte dans Stripe.",
    concierge: "enregistrer_carte",
    rule: "La carte se saisit dans Facturation. Rien n’est enregistré depuis le fil.",
  },
  {
    id: "page_carnet",
    page: "/mon-compte/carnet",
    route: "/api/client/bookings/[id]/calendrier",
    method: "GET",
    client: "Le carnet renvoie vers le prochain séjour.",
    concierge: "agenda_sejour",
    rule: "Même séjour visible que la page.",
  },
  {
    id: "page_paiement",
    page: "/mon-compte/profil/paiement",
    route: "/api/client/profile",
    method: "PATCH",
    client: "La page Paiement renvoie vers Facturation.",
    concierge: "modifier_fiche",
    rule: "Pas d’écran de cartes séparé. La facturation est la fiche.",
  },
  {
    id: "page_reservations",
    page: "/mon-compte/reservations",
    route: "/api/client/companions",
    method: "GET",
    client: "Liste les séjours visibles.",
    concierge: "lire_voyageurs",
    rule: "Séjours de l’expéditeur déjà chargés. Un séjour caché ne se cite pas.",
  },
  {
    id: "page_accueil",
    page: "/mon-compte",
    route: "/api/client/activity",
    method: "POST",
    client: "Accueil : le prochain séjour.",
    concierge: "lire_voyageurs",
    rule: "Le concierge répond avec le dossier déjà chargé.",
  },
];

export type ClassifiedSpace = {
  id: string;
  tool: string;
  name: string | null;
  reference: string | null;
  access: boolean;
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function referenceOf(message: string) {
  const match = message.match(/\bTB-\d{4}-\d{4}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function personName(message: string) {
  const labeled = message.match(
    /\b(?:voyageur|accompagnateur|accompagnatrice|passeport|pi[eè]ce)\s+(?:de\s+)?([A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){0,3})/u
  );
  if (labeled?.[1] && !/^(t[eé]l[eé]phone|num[eé]ro)$/i.test(labeled[1])) return labeled[1].trim();
  const match = message.match(/\b(?:de|pour|avec|a|à)\s+([A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){0,3})/u);
  const name = match?.[1]?.trim();
  if (!name || /^(t[eé]l[eé]phone|num[eé]ro|mail|soci[eé]t[eé]|agence|carte)$/i.test(name)) return null;
  return name;
}

function toolOf(id: string) {
  return CLIENT_SPACE_ACTIONS.find((row) => row.id === id)?.concierge || id;
}

/**
 * Geste d’espace client reconnu dans le message. Null si ce n’est pas un geste,
 * ou si le contact (téléphone, e-mail, naissance, pièce) est déjà pris ailleurs.
 * Une annulation de séjour, un envoi à l’hôtel : null, la main passe à l’agence.
 */
export function classifyClientSpace(message: string, opts?: { hasFile?: boolean }): ClassifiedSpace | null {
  const raw = message.trim();
  if (!raw || parseClientSpaceWrite(raw, opts)) return null;
  const text = fold(raw);
  const reference = referenceOf(raw);
  const name = personName(raw);
  const base = { name, reference, access: false };

  if (/\bhotel\b/.test(text) && /\bannul/.test(text)) {
    return { ...base, id: "annuler_hotel", tool: toolOf("annuler_hotel") };
  }
  if (/\b(chauffeur|transfert|vip|enregistrement|check-in|checkin)\b/.test(text) && /\bannul/.test(text)) {
    return { ...base, id: "demander_service", tool: toolOf("demander_service") };
  }
  if (/\b(mot de passe|password)\b/.test(text)) {
    return { ...base, id: "mot_de_passe", tool: toolOf("mot_de_passe"), access: true };
  }
  if (/\b(payer|paiement|r[eè]gler|reglement|encours)\b/.test(text)) {
    return { ...base, id: "regler_encours", tool: toolOf("regler_encours"), access: true };
  }
  if (/\b(carte bancaire|enregistrer une carte|ajouter une carte)\b/.test(text)) {
    return { ...base, id: "enregistrer_carte", tool: toolOf("enregistrer_carte"), access: true };
  }
  if (/\b(acc[eè]s|cherch\w*|r[eé]serv\w*)\b/.test(text) && /\bh[oô]tel/.test(text) && !/\bannul/.test(text)) {
    return { ...base, id: "acces_hotels", tool: toolOf("acces_hotels") };
  }
  if (/\b(chauffeur|transfert|vip airport|enregistrement en ligne|check-in)\b/.test(text) && /\b(ajout|veux|voudrais|demande|r[eé]serv)\w*\b/.test(text)) {
    return { ...base, id: "demander_service", tool: toolOf("demander_service") };
  }
  if (clientWriteHandsOff(raw)) return null;

  if (/\b(relev[eé]|statement)\b/.test(text)) {
    return { ...base, id: "envoyer_releve", tool: toolOf("envoyer_releve") };
  }
  if (/\b(carte bancaire|ma carte)\b/.test(text) && /\b(supprim|retir|enlev)/.test(text)) {
    return { ...base, id: "retirer_carte", tool: toolOf("retirer_carte") };
  }
  if (/\b(agenda|calendrier|ical)\b/.test(text)) {
    return { ...base, id: "agenda_sejour", tool: toolOf("agenda_sejour"), access: true };
  }
  if (/\b(importe[rz]*|dropzone)\b/.test(text) && /\b(dossier|pdf|document)\b/.test(text)) {
    return { ...base, id: "import_dossier", tool: toolOf("import_dossier") };
  }
  if (/\b(carte de l'h[oô]tel|carte hotel)\b/.test(text)) {
    return { ...base, id: "carte_hotel", tool: toolOf("carte_hotel") };
  }
  if (/\b(envoie[rz]*|partage[rz]*)\b/.test(text) && /\b(carnet|lien|s[eé]jour)\b/.test(text)) {
    return { ...base, id: "partager_carnet", tool: toolOf("partager_carnet") };
  }
  if (/\b(facture[rz]*|soci[eé]t[eé])\b/.test(text) && /\b(s[eé]jour|dossier)\b/.test(text)) {
    return { ...base, id: "facturer_sejour", tool: toolOf("facturer_sejour") };
  }
  if (/\b(retir|supprim|enlev)\w*\b/.test(text) && /\b(voyageur|accompagnateur|accompagnatrice)\b/.test(text)) {
    return { ...base, id: "retirer_accompagnateur", tool: toolOf("retirer_accompagnateur") };
  }
  if (/\b(ajout|cr[eé]e)\w*\b/.test(text) && /\b(voyageur|accompagnateur|accompagnatrice)\b/.test(text)) {
    return { ...base, id: "ajouter_accompagnateur", tool: toolOf("ajouter_accompagnateur") };
  }
  if (/\b(retir|supprim|enlev)\w*\b/.test(text) && /\b(passeport|pi[eè]ce|document)\b/.test(text)) {
    return { ...base, id: "retirer_piece", tool: toolOf("retirer_piece") };
  }
  if (/\b(mon iban|mon adresse|mon deuxi[eè]me num[eé]ro|mon second t[eé]l[eé]phone)\b/.test(text)) {
    return { ...base, id: "modifier_fiche", tool: toolOf("modifier_fiche") };
  }
  if (opts?.hasFile && /\b(visa|esta|eta)\b/.test(text)) {
    return { ...base, id: "deposer_formalite", tool: toolOf("deposer_formalite") };
  }
  if (/\b(esta|eta|formali[t][eé])\b/.test(text) && /\b(confirm|d[eé]pose|fais|fait)\w*\b/.test(text)) {
    return { ...base, id: "formalite", tool: toolOf("formalite"), access: true };
  }
  return null;
}
