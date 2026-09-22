export type LaunchSnapshot = {
  customerCount: number;
  customersWithoutPhone: number;
  bookingCount: number;
  publishedCount: number;
  revolutConfigured: boolean;
  revolutConnected: boolean;
  stripeConfigured: boolean;
  stripeWebhookConfigured: boolean;
};

export type LaunchItemId = "customers" | "carnet" | "phone" | "revolut" | "stripe";

export type LaunchItem = {
  id: LaunchItemId;
  done: boolean;
  optional: boolean;
  title: string;
  description: string;
  href: string;
  cta: string;
};

export function buildLaunchItems(snapshot: LaunchSnapshot): LaunchItem[] {
  const carnetDone = snapshot.publishedCount > 0;
  let carnetDescription: string;
  if (carnetDone) {
    carnetDescription = "Au moins un carnet est visible côté client.";
  } else if (snapshot.bookingCount > 0) {
    carnetDescription =
      "Des dossiers existent en brouillon. L’interrupteur « Visible dans l’espace » rend le carnet visible. Enregistrer ne publie pas.";
  } else {
    carnetDescription =
      "Ouvrez un client, importez les PDF, Enregistrer, puis Visible dans l’espace. Sans publication, le client n’a rien à ouvrir. Pas de séjour fictif.";
  }

  let revolutDescription: string;
  if (snapshot.revolutConnected) {
    revolutDescription =
      "Compte connecté. Les crédits reçus arrivent toutes les 15 min. Rapprochement automatique seulement s’il n’y a aucun doute ; sinon proposition dans l’inbox ou sur la fiche client.";
  } else if (snapshot.revolutConfigured) {
    revolutDescription =
      "Clés app présentes. Cliquez sur Connecter Revolut (authentification Business). Le cron toutes les 15 min remplira ensuite l’inbox.";
  } else {
    revolutDescription =
      "Clés Revolut à finaliser (Client ID après upload du certificat), puis Connecter Revolut.";
  }

  const stripeReady = snapshot.stripeConfigured && snapshot.stripeWebhookConfigured;
  const phoneMissing = snapshot.customersWithoutPhone;

  return [
    {
      id: "customers",
      done: snapshot.customerCount > 0,
      optional: false,
      title: "Fiche client titulaire",
      description:
        snapshot.customerCount > 0
          ? `${snapshot.customerCount} client${snapshot.customerCount > 1 ? "s" : ""} en base.`
          : "Créez le titulaire puis invitez-le. Pas de client fictif.",
      href: "/admin/clients",
      cta: "Ouvrir les clients",
    },
    {
      id: "carnet",
      done: carnetDone,
      optional: false,
      title: "Premier carnet publié",
      description: carnetDescription,
      href: "/admin/reservations",
      cta: "Importer un dossier",
    },
    {
      id: "phone",
      done: snapshot.customerCount === 0 || phoneMissing === 0,
      optional: true,
      title: "Téléphone client",
      description:
        phoneMissing > 0
          ? `${phoneMissing} fiche${phoneMissing > 1 ? "s" : ""} sans numéro : au premier accès le client le renseigne dans Vous. Ne pas inventer de téléphone.`
          : "Les fiches ont un numéro, ou le client le complétera dans Vous.",
      href: "/admin/clients",
      cta: "Voir les clients",
    },
    {
      id: "revolut",
      done: snapshot.revolutConnected,
      optional: false,
      title: "Connecter Revolut",
      description: revolutDescription,
      href: "/admin/revolut",
      cta: "Ouvrir Revolut",
    },
    {
      id: "stripe",
      done: stripeReady,
      optional: true,
      title: "Stripe live",
      description: stripeReady
        ? "Clés live et secret webhook présents. L’UI cartes reste fermée."
        : "Cartes fermées : le grand livre manuel fonctionne. Les clés Stripe live se posent côté serveur (Vercel), jamais depuis cet écran.",
      href: "/admin/transactions",
      cta: "Grand livre",
    },
  ];
}

/** Hide the card once every required geste is done. Optional leftovers (Stripe, téléphone) must not nag forever. */
export function visibleLaunchItems(items: LaunchItem[]): LaunchItem[] {
  const blocking = items.filter((item) => !item.optional && !item.done);
  if (!blocking.length) return [];
  return items.filter((item) => !item.done);
}

export function revolutInboxEmptyMessage(opts: {
  configured: boolean;
  connected: boolean;
}): string {
  if (!opts.configured) {
    return "Intégration Revolut non installée côté serveur. Une fois les clés posées, connectez le compte Business ici.";
  }
  if (!opts.connected) {
    return "Aucun virement tant que Revolut n’est pas connecté. Cliquez sur Connecter Revolut (authentification Business). Les virements reçus arriveront ensuite ici, toutes les 15 min.";
  }
  return "Aucun virement importé. Synchronisez ou attendez le cron (toutes les 15 min). Les crédits sans ambiguïté sont rapprochés automatiquement.";
}

export function bookingsListEmptyMessage(hasAnyBookings: boolean): string {
  if (!hasAnyBookings) {
    return "Aucun dossier. Importez les PDF d’un vrai séjour, Enregistrer, puis Visible dans l’espace. Le carnet n’apparaît côté client qu’après activation.";
  }
  return "Aucune réservation trouvée.";
}

export function ledgerEmptyMessage(hasAnyTransactions: boolean): string {
  if (!hasAnyTransactions) {
    return "Aucune écriture. Le débit se crée à la confirmation d’un séjour. Un virement Revolut crédite le client après rapprochement (auto si sans doute, sinon manuel).";
  }
  return "Aucune écriture pour ces filtres.";
}
