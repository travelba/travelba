import type { Universe } from "./types";
import { PREVIEW } from "./paths";
import { serviceUniverses } from "./services";

const app = (text: string) => text;

const pillars: Universe[] = [
  {
    slug: "club",
    path: `${PREVIEW}/club`,
    menu: "Club Travel BA",
    kicker: "Club Travel BA",
    title: "Les plus belles maisons,",
    em: "tenues autrement.",
    lede: "Le Club n’est pas une carte que l’on montre à la réception. C’est la manière dont Travel BA tient les hôtels : le tarif le plus juste, et les attentions qui se confirment avant l’arrivée.",
    image: "photo-1571896349842-33c89424de2d",
    alt: "Piscine d’hôtel et lumière du soir",
    essay: [
      "Réserver une grande maison ne suffit pas. Il faut savoir ce qui peut s’y obtenir, et ne rien annoncer qui ne soit écrit. Le Club Travel BA porte cela : les meilleurs tarifs sur les plus beaux hôtels, le petit-déjeuner offert, une arrivée anticipée ou un départ tardif, un surclassement en priorité lorsqu’une chambre est libre.",
      "Selon les hôtels, un crédit de dépenses peut aller jusqu’à 200 dollars pour le séjour. Il sert au bar, au spa, à un dîner. Il n’existe pas partout, et la maison le dit avant le départ, dans le carnet, pas à la réception le jour même.",
      "Ces avantages accompagnent les voyages sur mesure et les voyages signature. Ils ne remplacent pas le choix de la maison. Ils le prolongent.",
    ],
    steps: [
      { n: "01", title: "La maison", text: "Vous dites le lieu, la saison, l’allure du séjour. La maison propose des adresses, pas un catalogue ouvert." },
      { n: "02", title: "Ce qui est tenu", text: "Petit-déjeuner, horaires, surclassement, crédit : chaque ligne n’entre dans la proposition que si l’hôtel la confirme." },
      { n: "03", title: "Le carnet", text: "Le séjour publié dans l’application reprend la maison, les dates et les attentions obtenues. Vous les lisez avant d’atterrir." },
      { n: "04", title: "Le jour même", text: "Si une chambre meilleure se libère, la maison le sait. Le surclassement reste prioritaire, et il reste conditionnel." },
    ],
    points: [
      { title: "Les meilleurs tarifs", text: "Sur les plus beaux hôtels que la maison choisit avec vous." },
      { title: "Le petit-déjeuner", text: "Offert, lorsque l’adresse le prévoit. C’est écrit avant l’arrivée." },
      { title: "Les horaires", text: "Arrivée anticipée, départ tardif. En anglais, early check-in et late check-out." },
      { title: "Le surclassement", text: "En priorité, si une chambre est disponible. Jamais annoncé comme acquis." },
      { title: "Le crédit", text: "Jusqu’à 200 dollars de dépenses par séjour, selon les hôtels." },
    ],
    places: [
      { name: "Aman Tokyo", where: "Japon", text: "Une ville tenue d’en haut. Le petit-déjeuner et les horaires se demandent avec la réservation.", image: "photo-1540959733332-eab4deabeeaf", alt: "Ville la nuit" },
      { name: "Royal Mansour", where: "Marrakech", text: "Les riads privés. Les attentions du Club se confirment maison par maison.", image: "photo-1489749798305-4fea3ae63d43", alt: "Ciel et minaret" },
      { name: "Ellerman House", where: "Le Cap", text: "Une maison face à l’Atlantique. Le crédit, s’il existe, est dit avant le vol.", image: "photo-1516026672322-bc52d61a55d5", alt: "Plaine dorée" },
    ],
    app: app("Dans l’application, l’hôtel du Club apparaît comme les autres maisons du carnet : le nom, la ville, les nuits, les attentions confirmées. Rien ne se découvre à la réception."),
    layout: "membership",
    wa: "Bonjour, je souhaite parler du Club Travel BA et d’un hôtel.",
  },
  {
    slug: "sur-mesure",
    path: `${PREVIEW}/sur-mesure`,
    menu: "Voyages sur mesure",
    kicker: "Sur mesure",
    title: "Le voyage suit l’agenda,",
    em: "pas l’inverse.",
    lede: "Un voyage sur mesure Travel BA part de vous : les dates, les âges, le motif, le rythme. La maison compose ensuite l’hébergement, les vols, le sol et les heures.",
    image: "photo-1488646953014-85cb44e25828",
    alt: "Carte et lumière de voyage",
    essay: [
      "L’hébergement vient avec les avantages du Club Travel BA, lorsqu’ils existent pour l’adresse choisie. Les vols se comparent, en cabine, en horaire, en correspondance. Le vol privé s’ajoute lorsque l’agenda ne tient pas dans une ligne régulière, et seulement une fois l’appareil confirmé.",
      "Au départ et à l’arrivée, la voiture est là. À la sortie de l’avion, quelqu’un vous attend. Les visas et autorisations pour les États-Unis, le Royaume-Uni et Israël se préparent avec vous, dans le temps qu’il faut, sans promesse que l’administration ne tiendrait pas.",
      "Les activités s’écrivent seulement si elles ont une heure et un guide. Les restaurants se demandent, y compris les tables réputées complètes. Rien n’est inventé pour remplir une journée.",
    ],
    steps: [
      { n: "01", title: "Le brief", text: "Un échange, souvent court. Dates, personnes, envie, contraintes. La maison écoute avant de proposer." },
      { n: "02", title: "La proposition", text: "Un voyage écrit : maisons, vols, transferts, tables, formalités. Généralement sous vingt-quatre heures. Le détail se confirme, sur demande." },
      { n: "03", title: "L’organisation", text: "La maison tient les correspondances, les accueils, les horaires. Vous n’appelez pas dix interlocuteurs." },
      { n: "04", title: "Le séjour", text: "Le carnet s’ouvre dans l’application. Quelqu’un reste joignable, à toute heure, si la journée change." },
    ],
    points: [
      { title: "Hébergement", text: "Les maisons du Club, avec les avantages confirmés." },
      { title: "Vols", text: "Les options, en horaire et en cabine. Le vol privé si l’agenda l’exige." },
      { title: "Le sol", text: "Voiture au départ, voiture à l’arrivée, accueil à la sortie de l’avion." },
      { title: "Formalités", text: "Visas et autorisations pour les États-Unis, le Royaume-Uni et Israël." },
      { title: "Le vivant", text: "Activités tenues, tables demandées, même lorsqu’elles affichent complet." },
    ],
    places: [
      { name: "À deux", where: "Quelques nuits", text: "Une table, une maison, peu de programme.", image: "photo-1523906834658-6e24ef2386f9", alt: "Ville d’eau au crépuscule", href: `${PREVIEW}/services/a-deux` },
      { name: "Le jet", where: "Lorsque l’heure commande", text: "L’appareil se confirme. Le sol est tenu aussi.", image: "photo-1540962351504-03099e0a754b", alt: "Avion d’affaires au sol", href: `${PREVIEW}/services/jet-prive` },
      { name: "L’accueil", where: "À la porte de l’avion", text: "Quelqu’un, un nom, la voiture derrière.", image: "photo-1556388158-158ea5ccacbd", alt: "Hall d’aéroport", href: `${PREVIEW}/services/accueil-vip` },
    ],
    app: app("Le voyage sur mesure devient un carnet : jours, vols, maisons, transferts, accueil, tables, documents. Le conseiller y reste joignable."),
    layout: "essay",
    wa: "Bonjour, je souhaite composer un voyage sur mesure avec Travel BA.",
  },
  {
    slug: "kids",
    path: `${PREVIEW}/kids`,
    menu: "Kids",
    kicker: "Univers Kids",
    title: "L’enfance,",
    em: "au même niveau.",
    lede: "Un séjour en famille tient lorsque les enfants ont leur lieu, et les parents le leur. Travel BA choisit les clubs et les hôtels qui savent les deux, puis elle tient la voiture, le siège, et la nounou si vous la demandez.",
    image: "photo-1507525428034-b723cf961d3e",
    alt: "Plage et eau claire",
    essay: [
      "Club Med, lorsque le club est le bon âge et le bon rivage. Sani Resort, en Chalcidique, lorsque la famille veut la mer et un kids club tenu. Ikos, lorsque le tout compris doit avoir le calme d’une maison. Et les hôtels où le kids club existe vraiment : un programme, des chambres qui se parlent, une heure pour les parents.",
      "Le transfert ne s’improvise pas avec un enfant. La voiture a un siège bébé, ou des sièges enfants, dès l’aéroport. Sur place, une nounou peut prendre le relais : le temps d’un dîner, d’une après-midi, d’une journée. Elle se confirme avant le départ.",
      "Le carnet de la famille montre les heures qui comptent : le vol, l’hôtel, le transfert, le club. Les adultes lisent le même fil. Personne ne cherche un papier dans un sac.",
    ],
    steps: [
      { n: "01", title: "Les âges", text: "La maison demande les âges avant les destinations. Un club de quatre ans n’est pas un club de douze." },
      { n: "02", title: "La maison", text: "Club Med, Sani, Ikos, ou un hôtel dont le kids club est réel. Le choix se fait avec vous." },
      { n: "03", title: "La route", text: "Siège bébé, sièges enfants, dans la voiture de l’arrivée et dans celles du séjour." },
      { n: "04", title: "La nounou", text: "Sur place, pour les heures que vous voulez garder. Elle est demandée, puis confirmée." },
    ],
    points: [
      { title: "Les clubs", text: "Une sélection courte, premium, pas une brochure." },
      { title: "Les hôtels", text: "Ceux qui ont vraiment un kids club, des chambres reliées, un rythme." },
      { title: "La voiture", text: "Le siège est déjà installé. Vous ne le cherchez pas à l’arrivée." },
      { title: "Le relais", text: "Une nounou, le temps qu’il faut, sans que le séjour en dépende en secret." },
    ],
    places: [
      { name: "Club Med", where: "Villages choisis", text: "Lorsque le club, l’âge et le rivage vont ensemble. La maison ne propose pas tous les villages : elle propose le juste.", image: "photo-1551918120-9739cb430c6d", alt: "Lagon et sable" },
      { name: "Sani Resort", where: "Chalcidique", text: "La mer, les pins, un kids club tenu. La famille reste au même endroit plusieurs jours.", image: "photo-1514282401047-d79a71a590e8", alt: "Eau turquoise" },
      { name: "Ikos", where: "Méditerranée", text: "Le tout compris, avec le calme d’une maison. Les enfants ont leur club. Les parents ont la table.", image: "photo-1571896349842-33c89424de2d", alt: "Piscine et lumière douce" },
      { name: "Les hôtels", where: "Kids club réel", text: "Four Seasons, One&Only, Rosewood, lorsqu’ils ont un vrai club et des chambres qui se parlent. Amanpuri ou Cheval Blanc, si les âges s’y prêtent.", image: "photo-1520250497591-112f2f40a3f4", alt: "Piscine d’un resort" },
    ],
    app: app("Le carnet familial montre le vol, la maison, le transfert avec les sièges, et les heures du club. Une nounou confirmée y apparaît comme un rendez-vous, pas comme un message perdu."),
    layout: "family",
    wa: "Bonjour, je prépare un séjour en famille et je souhaite en parler avec Travel BA.",
  },
  {
    slug: "seminaires",
    path: `${PREVIEW}/seminaires`,
    menu: "Séminaires",
    kicker: "Séminaires et événements privés",
    title: "Un groupe,",
    em: "tenu comme un séjour.",
    lede: "Le séminaire, l’anniversaire, l’enterrement de vie de garçon : trois motifs, la même maison. Les arrivées, les chambres, les heures et le retour sont écrits avant le jour même.",
    image: "photo-1540575467063-178a50c2df87",
    alt: "Salle claire, lumière du jour",
    essay: [
      "Un séminaire d’entreprise n’est pas une salle louée au hasard. C’est un lieu, un ordre du jour, des chambres, des dîners, et quelqu’un qui répond lorsque le vol d’un participant bouge.",
      "Un anniversaire privé se tient dans une maison, autour d’une table, avec les arrivées des invités déjà rangées. Un enterrement de vie de garçon se tient de la même façon : discret, exact, sans mise en scène inutile. La maison accompagne aussi un enterrement de vie de jeune fille, avec le même soin.",
      "Le groupe a son fil. Chacun peut avoir son carnet. La maison voit l’ensemble.",
    ],
    steps: [
      { n: "01", title: "Le motif", text: "Séminaire, anniversaire, EVG. Le nombre, les dates, le ton. La maison refuse le lieu qui ne va pas." },
      { n: "02", title: "Le lieu", text: "Une maison, un palace, un domaine. Marrakech en est un, parmi d’autres. Le choix se fait avec vous." },
      { n: "03", title: "La logistique", text: "Vols, chambres, salles, dîners, retours. Écrits. Les imprévus ont un interlocuteur." },
      { n: "04", title: "Le jour", text: "Quelqu’un de la maison, ou le fil, jusqu’au dernier départ." },
    ],
    points: [
      { title: "L’entreprise", text: "Comité, incentive, séminaire. Un ordre du jour, pas une animation plaquée." },
      { title: "L’anniversaire", text: "La maison, la table, les invités, le lendemain matin." },
      { title: "L’EVG", text: "Enterrement de vie de garçon, tenu avec discrétion." },
      { title: "Le fil", text: "Chacun sait où aller. La maison sait qui manque." },
    ],
    places: [
      { name: "Séminaire", where: "Entreprise", text: "Lieu, salle, chambres, dîners. Le groupe arrive déjà rangé.", image: "photo-1540575467063-178a50c2df87", alt: "Salle de travail lumineuse", href: `${PREVIEW}/professionnels` },
      { name: "Anniversaire", where: "Privé", text: "Une maison, une table, des arrivées tenues.", image: "photo-1511795409834-ef04bbd61622", alt: "Table de réception", href: `${PREVIEW}/services/anniversaire` },
      { name: "EVG", where: "Quelques jours", text: "Le voyage des amis, sans bruit inutile.", image: "photo-1533104816931-20fa691ff6ca", alt: "Côte et villages", href: `${PREVIEW}/services/evg` },
    ],
    app: app("Les participants retrouvent vols, maison et horaires dans l’application. Le fil avec la maison reste ouvert pendant l’événement."),
    layout: "occasions",
    wa: "Bonjour, je prépare un séminaire ou un événement privé avec Travel BA.",
  },
  {
    slug: "professionnels",
    path: `${PREVIEW}/professionnels`,
    menu: "Professionnels",
    kicker: "Déplacements professionnels",
    title: "L’entreprise voyage,",
    em: "avec une politique.",
    lede: "Une politique de prix claire, des tarifs préférentiels, des collaborateurs et des cadres dans la même application, et un agent Travel BA joignable vingt-quatre heures sur vingt-quatre.",
    image: "photo-1497366754035-f200968a6e72",
    alt: "Bureau calme et lumière naturelle",
    essay: [
      "La politique de prix se fixe avec l’entreprise : ce qui se prend en cabine, ce qui se prend en train, les maisons autorisées, la façon dont la facture est établie au nom de la société. Les tarifs préférentiels suivent cette politique. Ils ne se négocient pas à chaque billet, dans l’urgence.",
      "Les collaborateurs et les cadres n’ont pas un outil en libre-service qui réserve à leur place. Ils ont l’application : le carnet de leur voyage, les documents, le conseiller. La réservation reste tenue par l’agence, selon la règle de l’entreprise. Chacun voit son déplacement. La maison voit l’ensemble.",
      "Pendant le voyage, un agent Travel BA répond, de jour comme de nuit. Un vol qui bouge, une réunion qui se décale, une voiture qui doit être plus tôt : le carnet suit.",
    ],
    steps: [
      { n: "01", title: "La politique", text: "Cabines, maisons, facturation. Une règle écrite avec vous, avant les déplacements." },
      { n: "02", title: "Les tarifs", text: "Préférentiels, dans le cadre de cette politique. Le détail se confirme, sur demande." },
      { n: "03", title: "Les voyageurs", text: "Collaborateurs et cadres ouvrent l’application. Leur voyage y est. La réservation reste à l’agence." },
      { n: "04", title: "L’agent", text: "Vingt-quatre heures sur vingt-quatre, pendant le déplacement. Un seul fil." },
    ],
    points: [
      { title: "La société", text: "La facture peut être établie pour l’entreprise." },
      { title: "Le cadre", text: "Le même niveau que le privé, avec la règle de la maison." },
      { title: "L’équipe", text: "Plusieurs voyageurs, plusieurs carnets, une agence." },
      { title: "La nuit", text: "Quelqu’un répond lorsque le vol ne répond plus." },
    ],
    places: [
      { name: "Le comité", where: "Quelques personnes", text: "Même ville, mêmes heures, chambres déjà attribuées.", image: "photo-1540575467063-178a50c2df87", alt: "Salle de réunion" },
      { name: "Le dirigeant", where: "Seul, souvent", text: "L’horaire juste, la voiture, l’accueil. Peu de friction.", image: "photo-1540962351504-03099e0a754b", alt: "Avion d’affaires" },
      { name: "Le séminaire", where: "Le groupe", text: "Lorsque le déplacement devient un séjour.", image: "photo-1489749798305-4fea3ae63d43", alt: "Ville au soleil", href: `${PREVIEW}/seminaires` },
    ],
    app: app("Chaque collaborateur ouvre son carnet. Les documents, le vol et la voiture y sont. L’agent Travel BA est au bout du fil, à toute heure."),
    layout: "desk",
    wa: "Bonjour, je souhaite parler des déplacements professionnels de mon entreprise avec Travel BA.",
  },
];

export const universes: Universe[] = [...pillars, ...serviceUniverses];

export function universeBySlug(slug: string) {
  return universes.find((item) => item.slug === slug) ?? null;
}
