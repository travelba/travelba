/**
 * Cadence des 15 crons Vercel. L’heure est UTC.
 * Les minutes sont décalées : plus rien ne part ensemble à :00, :15, :30 et :45.
 * Le détail de chaque choix est `reason`. Le test compare `schedule` à vercel.json.
 */

export type CronCadence = {
  path: string;
  schedule: string;
  reason: string;
};

export const CRON_CADENCE: CronCadence[] = [
  {
    path: "/api/cron/revolut-sync",
    schedule: "2,17,32,47 * * * *",
    reason:
      "Les virements restent visibles dans le quart d’heure. Le webhook est la voie rapide, le cron rattrape. Décalé à la minute 2 pour ne pas partir avec les autres lectures.",
  },
  {
    path: "/api/cron/stripe-sync",
    schedule: "7,22,37,52 * * * *",
    reason:
      "Même quart d’heure pour les encaissements, décalé à la minute 7. Le webhook payment_intent.succeeded crédite déjà ; le cron rattrape un prélèvement dont le webhook a manqué.",
  },
  {
    path: "/api/cron/pliant-sync",
    schedule: "12,42 * * * *",
    reason:
      "Une dépense carte n’est pas un encaissement client. Toutes les 30 minutes suffit avant le pointage, et le jeton Auth0 n’est pas redemandé.",
  },
  {
    path: "/api/cron/gmail-ingest",
    schedule: "1,6,11,16,21,26,31,36,41,46,51,56 * * * *",
    reason:
      "Les billets et les annulations restent lus toutes les 5 minutes. Décalé d’une minute pour éviter la minute pile, où plusieurs crons se rejoignaient.",
  },
  {
    path: "/api/cron/gmail-watch-renew",
    schedule: "17 5 * * *",
    reason: "Le watch Gmail dure plusieurs jours. Un renouvellement par jour à 5 h 17 UTC, à l’écart des autres tâches du matin.",
  },
  {
    path: "/api/cron/visa-desk",
    schedule: "23 6,8,10 * * *",
    reason:
      "Trois passages le matin (6 h 23, 8 h 23 et 10 h 23 UTC) pour relancer une formalité du jour, au lieu de trois heures pile d’affilée.",
  },
  {
    path: "/api/cron/little-emperors-sync",
    schedule: "14,44 * * * *",
    reason:
      "Le séjour Little Emperors reste relu toutes les 30 minutes. Décalé à :14 et :44 pour ne plus tomber en même temps que les autres.",
  },
  {
    path: "/api/cron/concierge",
    schedule: "4,19,34,49 * * * *",
    reason: "La file WhatsApp (séjour, pièces, rappels) part encore tous les quarts d’heure. Décalée à la minute 4 : on ne ralentit pas l’envoi.",
  },
  {
    path: "/api/cron/whatsapp-handoff",
    schedule: "*/2 * * * *",
    reason:
      "Un fil tenu par l’agence revient au Concierge après 5 minutes sans activité. Un passage toutes les 2 minutes le rend en moins de 7 minutes. Les messages WhatsApp arrivent par le webhook, pas par ce cron.",
  },
  {
    path: "/api/cron/hotel-arrival",
    schedule: "11,41 * * * *",
    reason:
      "L’arrivée à l’hôtel et le ménage des cartes peuvent attendre 30 minutes. Les fils d’hôtel sont déjà relus par l’ingestion Gmail, toutes les 5 minutes.",
  },
  {
    path: "/api/cron/flight-status",
    schedule: "8 * * * *",
    reason: "Le suivi des vols reste horaire. La minute 8 ne coïncide plus avec l’ancienne salve des quarts d’heure.",
  },
  {
    path: "/api/cron/esta",
    schedule: "18 * * * *",
    reason: "Le statut ESTA ne bouge pas au quart d’heure. Une fois par heure, à la minute 18, suffit pour préparer le message.",
  },
  {
    path: "/api/cron/uk-eta",
    schedule: "33 * * * *",
    reason: "Même cadence que l’ESTA, à la minute 33, pour ne pas lire les dossiers en même temps.",
  },
  {
    path: "/api/cron/restaurants",
    schedule: "3,18,33,48 * * * *",
    reason:
      "L’envoi de 16 h et la clôture de 18 h suivent le fuseau de chaque séjour, donc le cron tourne toute la journée. Tous les quarts d’heure, décalé de 3 minutes, pour ne pas rater la fenêtre de plus d’un quart d’heure.",
  },
  {
    path: "/api/cron/ratehawk-content",
    schedule: "10 3 * * *",
    reason: "Le catalogue Ratehawk reste nocturne, une fois par jour, à 3 h 10 UTC, avant la matinée de l’agence.",
  },
];
