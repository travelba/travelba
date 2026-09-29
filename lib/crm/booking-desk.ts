/** Présentations du dossier réservation, côté agence. */

export const BOOKING_VUE_KEY = "travelba-booking-vue";

export const BOOKING_VUES = [
  {
    id: "bureau",
    label: "Bureau",
    line: "Une étape à la fois. Pour traiter le dossier sans se perdre.",
  },
  {
    id: "histoire",
    label: "Histoire",
    line: "Le voyage se lit de haut en bas, du départ à l’espace client.",
  },
  {
    id: "tableau",
    label: "Tableau",
    line: "Toutes les cases d’un coup d’œil. On ouvre celle qui cloche.",
  },
] as const;

export type BookingVue = (typeof BOOKING_VUES)[number]["id"];

export const DESK_SECTIONS = [
  "aujourd",
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "argent",
  "papiers",
  "client",
  "dossier",
] as const;

export type DeskSectionId = (typeof DESK_SECTIONS)[number];

export const BUREAU_ORDER: DeskSectionId[] = [
  "aujourd",
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "argent",
  "papiers",
  "client",
  "dossier",
];

export const HISTOIRE_ORDER: DeskSectionId[] = [
  "dossier",
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "papiers",
  "argent",
  "client",
];

export const TABLEAU_ORDER: DeskSectionId[] = [
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "argent",
  "papiers",
  "client",
  "dossier",
];

export const DESK_COPY: Record<DeskSectionId, { label: string; title: string; lead: string }> = {
  aujourd: {
    label: "Aujourd’hui",
    title: "Par où commencer",
    lead: "Ce qui demande une action. Le reste peut attendre.",
  },
  programme: {
    label: "Programme",
    title: "Le programme du séjour",
    lead: "Vols, trains, hôtels, transferts. Déposez un document, relisez l’étape, puis enregistrez.",
  },
  voyageurs: {
    label: "Voyageurs",
    title: "Qui part",
    lead: "Ajoutez chaque personne. Le passeport se reprend sur la fiche du client.",
  },
  formalites: {
    label: "Formalités",
    title: "Entrée dans le pays",
    lead: "Autorisation ou visa, seulement quand le vol le demande.",
  },
  hotel: {
    label: "Hôtel",
    title: "Arrivée à l’hôtel",
    lead: "Heure d’arrivée et messages à envoyer à l’établissement.",
  },
  argent: {
    label: "Règlement",
    title: "Ce qui est facturé",
    lead: "Le montant du séjour, la devise, qui paie, et les frais en plus.",
  },
  papiers: {
    label: "Papiers",
    title: "Documents du dossier",
    lead: "Billets, vouchers, devis. Le client les voit après la publication.",
  },
  client: {
    label: "Espace client",
    title: "Ce que voit le client",
    lead: "Le message, le lien à partager, puis le carnet. Rien n’est visible tant que vous ne publiez pas.",
  },
  dossier: {
    label: "Dossier",
    title: "Le dossier",
    lead: "Titre, dates, client, statut. Enregistrer garde ces informations. Cela ne montre pas le voyage.",
  },
};
