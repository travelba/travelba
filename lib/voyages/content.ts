/**
 * Catalogue « voyage sur mesure & destinations ».
 *
 * Ajouter une destination : copier un objet dans DESTINATIONS.
 * Slug unique, continent, thèmes, photo Unsplash, textes fr et en.
 * La page /voyages/destinations/[slug] est générée toute seule.
 *
 * Ajouter une envie : un objet dans THEMES, puis son id dans `themes` des destinations.
 *
 * Ajouter un voyage signature TBA (faits réels, plus tard) : compléter
 * les emplacements de lib/site-offers.ts, pages /voyages/signature/voyage-0N.
 * Ne pas y mettre un prix ou un hôtel partenaire qui n’est pas décidé.
 */

export type LocaleCopy = { fr: string; en: string };

const L = (fr: string, en: string): LocaleCopy => ({ fr, en });

export function copy(locale: string, value: LocaleCopy) {
  return locale === "en" ? value.en : value.fr;
}

export type ContinentId = "europe" | "afrique" | "ameriques" | "asie" | "ocean-indien" | "pacifique";

export type ThemeId = "lune-de-miel" | "safari" | "iles" | "road-trip" | "culture" | "grand-nord";

export type IdeaBeat = { title: LocaleCopy; text: LocaleCopy };

export type Destination = {
  slug: string;
  name: LocaleCopy;
  continent: ContinentId;
  featured?: boolean;
  image: string;
  imageAlt: LocaleCopy;
  tagline: LocaleCopy;
  intro: LocaleCopy;
  /** Quand partir, climat. Faits généraux, pas une promesse de l’agence. */
  when: LocaleCopy;
  highlights: LocaleCopy[];
  stays: LocaleCopy[];
  idea: { title: LocaleCopy; note: LocaleCopy; beats: IdeaBeat[] };
  flight: LocaleCopy;
  time: LocaleCopy;
  formalities: LocaleCopy;
  themes: ThemeId[];
};

export const CONTINENTS: { id: ContinentId; name: LocaleCopy }[] = [
  { id: "europe", name: L("Europe", "Europe") },
  { id: "afrique", name: L("Afrique", "Africa") },
  { id: "ocean-indien", name: L("Océan Indien", "Indian Ocean") },
  { id: "asie", name: L("Asie", "Asia") },
  { id: "pacifique", name: L("Pacifique", "Pacific") },
  { id: "ameriques", name: L("Amériques", "Americas") },
];

export const THEMES: {
  id: ThemeId;
  name: LocaleCopy;
  lede: LocaleCopy;
}[] = [
  {
    id: "lune-de-miel",
    name: L("Lune de miel", "Honeymoon"),
    lede: L(
      "Deux rythmes, une suite, et le temps de ne rien prévoir. Îles, villes ou route, le séjour se dessine autour de vous.",
      "Two paces, one suite, and time with nothing planned. Islands, cities or a road, the stay is drawn around you."
    ),
  },
  {
    id: "safari",
    name: L("Safari", "Safari"),
    lede: L(
      "Lever tôt, piste, et le soir au camp. L’Afrique de l’Est et l’Afrique du Sud se lisent par la saison, pas par un catalogue figé.",
      "An early start, the track, and the evening at camp. East Africa and South Africa are read by the season, not by a fixed catalogue."
    ),
  },
  {
    id: "iles",
    name: L("Îles", "Islands"),
    lede: L(
      "Lagon, villa les pieds dans l’eau, ou île plus vive. Le choix se fait sur la saison sèche, le vol, et l’envie de bouger ou non.",
      "A lagoon, a villa over the water, or a livelier island. The choice turns on the dry season, the flight, and whether you want to move."
    ),
  },
  {
    id: "road-trip",
    name: L("Road trip", "Road trip"),
    lede: L(
      "Une route, peu d’hôtels, et des étapes qui respirent. L’Ouest américain, l’Islande, le Maroc ou la côte sud-africaine s’y prêtent.",
      "One road, few hotels, and stages with room to breathe. The American West, Iceland, Morocco or the South African coast suit it."
    ),
  },
  {
    id: "culture",
    name: L("Culture", "Culture"),
    lede: L(
      "Villes, temples, tables et musées, avec des journées qui ne s’empilent pas. Le rythme compte autant que la liste.",
      "Cities, temples, tables and museums, with days that do not stack. Pace matters as much as the list."
    ),
  },
  {
    id: "grand-nord",
    name: L("Grand Nord", "Far North"),
    lede: L(
      "Lumière d’hiver ou soleil de minuit. L’Islande et la Laponie se choisissent selon la saison, pas selon une seule image.",
      "Winter light or the midnight sun. Iceland and Lapland are chosen by the season, not by a single picture."
    ),
  },
];

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1800&q=75`;

export const DESTINATIONS: Destination[] = [
  {
    slug: "maldives",
    name: L("Maldives", "Maldives"),
    continent: "ocean-indien",
    featured: true,
    image: photo("photo-1514282401047-d79a71a590e8"),
    imageAlt: L("Villas sur le lagon", "Villas over a lagoon"),
    tagline: L("Un atoll, un lagon, et le choix de ne presque pas bouger.", "One atoll, one lagoon, and the choice to barely move."),
    intro: L(
      "Les Maldives se lisent atoll par atoll. Certains restent dans une villa sur pilotis. D’autres veulent une île plus grande, une maison d’hôtes, ou une journée de plongée. Le sur-mesure commence par ce rythme.",
      "The Maldives are read atoll by atoll. Some stay in a villa on stilts. Others want a larger island, a guesthouse, or a day of diving. Tailor-made travel starts with that pace."
    ),
    when: L(
      "La saison sèche va de décembre à avril, avec le vent du nord-est. De mai à novembre, la mousson apporte plus d’averses, une mer parfois plus agitée, et souvent moins de monde. On voyage toute l’année. Le choix dépend du soleil recherché et de la plongée.",
      "The drier season runs from December to April, with the north-east wind. From May to November the monsoon brings more showers, a sea that can be rougher, and often fewer people. People travel year-round. The choice depends on the sun you want and on the diving."
    ),
    highlights: [
      L("Une villa sur le lagon, ou une plage de l’île-hôtel.", "A villa over the lagoon, or a beach on the resort island."),
      L("Plongée et snorkeling sur le tombant du récif.", "Diving and snorkelling on the reef wall."),
      L("Une journée île locale, sans en faire un programme chargé.", "A day on a local island, without turning it into a packed programme."),
      L("Le transfert en hydravion ou en bateau, qui fait déjà partie du voyage.", "The seaplane or boat transfer, which is already part of the journey."),
    ],
    stays: [
      L("Île-hôtel privée, une villa, peu de déplacements.", "A private resort island, one villa, little moving."),
      L("Deux atolls, si l’on veut changer de paysage.", "Two atolls, if you want a change of landscape."),
      L("Séjour plus simple, pension ou île habitée, pour un autre rythme.", "A simpler stay, a guesthouse or an inhabited island, for another pace."),
    ],
    idea: {
      title: L("Idée de voyage · une semaine, un atoll", "Travel idea · one week, one atoll"),
      note: L(
        "Suggestion de rythme, pas un circuit vendu, pas un prix.",
        "A suggested pace, not a packaged tour, and not a price."
      ),
      beats: [
        { title: L("Jour 1", "Day 1"), text: L("Vol, puis hydravion ou bateau jusqu’à l’île.", "Flight, then a seaplane or boat to the island.") },
        { title: L("Jours 2 à 5", "Days 2 to 5"), text: L("Lagon, plongée ou rien. Le programme reste ouvert.", "The lagoon, a dive, or nothing. The programme stays open.") },
        { title: L("Jour 6", "Day 6"), text: L("Une sortie vers une île habitée, si vous le souhaitez.", "An outing to an inhabited island, if you want it.") },
        { title: L("Jour 7", "Day 7"), text: L("Retour vers Malé et le vol de nuit.", "Back to Malé and the night flight.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 11 à 14 h, avec une escale.", "From Paris, allow about 11 to 14 hours, with a connection."),
    time: L(
      "Les Maldives sont à UTC+5. En hiver, 4 h de plus qu’à Paris. En été, 3 h.",
      "The Maldives are on UTC+5. In winter, 4 hours ahead of Paris. In summer, 3."
    ),
    formalities: L(
      "Passeport français : pas de visa pour un séjour touristique d’au plus 30 jours. Le passeport doit être en cours de validité.",
      "A French passport: no visa for a tourist stay of up to 30 days. The passport must be valid."
    ),
    themes: ["lune-de-miel", "iles"],
  },
  {
    slug: "polynesie",
    name: L("Polynésie française", "French Polynesia"),
    continent: "pacifique",
    featured: true,
    image: photo("photo-1559128010-7c1ad6e1b6a5"),
    imageAlt: L("Lagon de Bora Bora", "Bora Bora lagoon"),
    tagline: L("Tahiti, les îles hautes, et le lagon plus loin.", "Tahiti, the high islands, and the lagoon further out."),
    intro: L(
      "La Polynésie n’est pas une seule île. Tahiti sert souvent de porte. Moorea est proche. Bora Bora, Tikehau ou Rangiroa demandent un autre vol. Le sur-mesure décide combien d’îles, et combien de jours sans transfert.",
      "French Polynesia is not one island. Tahiti is often the door. Moorea is close. Bora Bora, Tikehau or Rangiroa need another flight. Tailor-made travel decides how many islands, and how many days without a transfer."
    ),
    when: L(
      "La saison plus sèche va de mai à octobre. De novembre à avril, il pleut davantage et le risque cyclonique existe. Les lagons restent beaux. On évite simplement d’enchaîner trop de bateaux quand la mer est forte.",
      "The drier season runs from May to October. From November to April it rains more and there is a cyclone risk. The lagoons stay beautiful. The point is not to stack too many boats when the sea is rough."
    ),
    highlights: [
      L("Le lagon de Bora Bora, ou un motu plus calme aux Tuamotu.", "The Bora Bora lagoon, or a quieter motu in the Tuamotus."),
      L("Moorea, en face de Tahiti, pour les montagnes et les raies.", "Moorea, across from Tahiti, for the mountains and the rays."),
      L("Rangiroa, si la plongée prime sur la villa.", "Rangiroa, if diving matters more than the villa."),
      L("Un jour à Papeete seulement s’il sert le vol, pas comme une ville de plus.", "A day in Papeete only if it serves the flight, not as another city."),
    ],
    stays: [
      L("Deux îles, pas trois, pour une semaine réelle.", "Two islands, not three, for a real week."),
      L("Une seule île, pension ou hôtel, si le vol a déjà été long.", "One island, a guesthouse or a hotel, if the flight was already long."),
      L("Lune de miel : une villa sur le lagon, et peu de programme.", "A honeymoon: a villa over the lagoon, and little programme."),
    ],
    idea: {
      title: L("Idée de voyage · dix jours, deux îles", "Travel idea · ten days, two islands"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 et 2", "Days 1 and 2"), text: L("Arrivée à Tahiti, nuit de récupération, Moorea le lendemain.", "Arrival in Tahiti, a night to recover, Moorea the next day.") },
        { title: L("Jours 3 à 5", "Days 3 to 5"), text: L("Moorea, sans excursion chaque matin.", "Moorea, without an excursion every morning.") },
        { title: L("Jours 6 à 9", "Days 6 to 9"), text: L("Vol vers Bora Bora ou une île des Tuamotu.", "A flight to Bora Bora or a Tuamotu island.") },
        { title: L("Jour 10", "Day 10"), text: L("Retour sur Tahiti pour le vol international.", "Back to Tahiti for the international flight.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 20 à 24 h, avec une escale.", "From Paris, allow about 20 to 24 hours, with a connection."),
    time: L(
      "Tahiti est à UTC−10. En hiver, 11 h de moins qu’à Paris. En été, 12 h.",
      "Tahiti is on UTC−10. In winter, 11 hours behind Paris. In summer, 12."
    ),
    formalities: L(
      "La Polynésie française est dans la République. Un voyageur français part avec une carte nationale d’identité ou un passeport en cours de validité. Le contrôle à l’embarquement demande une pièce lisible.",
      "French Polynesia is part of the French Republic. A French traveller leaves with a valid national identity card or passport. Check-in asks for a readable document."
    ),
    themes: ["lune-de-miel", "iles"],
  },
  {
    slug: "japon",
    name: L("Japon", "Japan"),
    continent: "asie",
    featured: true,
    image: photo("photo-1493976040374-85c8e12f0c0e"),
    imageAlt: L("Sanctuaire au Japon", "A shrine in Japan"),
    tagline: L("Villes, trains, et une campagne qui demande des nuits.", "Cities, trains, and a countryside that needs nights."),
    intro: L(
      "Un Japon sur mesure n’empile pas Tokyo, Kyoto et Hiroshima en cinq jours. On choisit une saison, deux ou trois bases, et les trajets en train qui valent le voyage. Le reste se laisse.",
      "A tailor-made Japan does not stack Tokyo, Kyoto and Hiroshima into five days. You choose a season, two or three bases, and the train rides that are worth the journey. The rest is left open."
    ),
    when: L(
      "Fin mars et avril pour les cerisiers, selon l’année et la latitude. Octobre et novembre pour les érables. L’été est chaud et humide, utile pour les fêtes et la montagne. L’hiver ouvre les onsen et, plus au nord, la neige. Golden Week, début mai, et Obon, à la mi-août, saturent les trains.",
      "Late March and April for the cherry trees, depending on the year and the latitude. October and November for the maples. Summer is hot and humid, useful for festivals and the mountains. Winter opens the onsen and, further north, the snow. Golden Week, in early May, and Obon, in mid-August, fill the trains."
    ),
    highlights: [
      L("Tokyo comme base, pas comme une liste de quartiers à cocher.", "Tokyo as a base, not as a list of districts to tick."),
      L("Kyoto à pied, avec des nuits sur place.", "Kyoto on foot, with nights on the spot."),
      L("Un train qui est l’étape : Hakone, Kanazawa, ou plus loin.", "A train that is the stage: Hakone, Kanazawa, or further."),
      L("Un onsen, une nuit, sans le coller à une journée de visites.", "An onsen, one night, not glued to a day of sightseeing."),
    ],
    stays: [
      L("Ville et campagne proche, une semaine.", "A city and the nearby countryside, one week."),
      L("Tokyo, Kyoto, et une troisième ville si le voyage dure dix jours.", "Tokyo, Kyoto, and a third city if the trip lasts ten days."),
      L("Hiver au nord, ou été dans les Alpes japonaises, pour un autre Japon.", "Winter in the north, or summer in the Japanese Alps, for another Japan."),
    ],
    idea: {
      title: L("Idée de voyage · neuf jours, deux bases", "Travel idea · nine days, two bases"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 à 4", "Days 1 to 4"), text: L("Tokyo. Un quartier par jour, pas cinq.", "Tokyo. One district a day, not five.") },
        { title: L("Jour 5", "Day 5"), text: L("Shinkansen vers Kyoto. L’après-midi reste libre.", "Shinkansen to Kyoto. The afternoon stays free.") },
        { title: L("Jours 6 à 8", "Days 6 to 8"), text: L("Kyoto, et éventuellement Nara sur une journée.", "Kyoto, and possibly Nara for one day.") },
        { title: L("Jour 9", "Day 9"), text: L("Retour vers l’aéroport, sans visite ajoutée.", "Back to the airport, with no added sightseeing.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 12 h en vol direct vers Tokyo.", "From Paris, allow about 12 hours non-stop to Tokyo."),
    time: L("Le Japon est à UTC+9. En hiver, 8 h de plus qu’à Paris. En été, 7 h.", "Japan is on UTC+9. In winter, 8 hours ahead of Paris. In summer, 7."),
    formalities: L(
      "Passeport français : pas de visa pour un séjour touristique court, dans la limite de 90 jours. Les règles de contrôle se vérifient avant le départ.",
      "A French passport: no visa for a short tourist stay, within 90 days. Entry checks should be confirmed before departure."
    ),
    themes: ["culture"],
  },
  {
    slug: "italie",
    name: L("Italie", "Italy"),
    continent: "europe",
    featured: true,
    image: photo("photo-1515542622106-78bda8ba0e5b"),
    imageAlt: L("Rome", "Rome"),
    tagline: L("Une région à la fois, et une table qui n’est pas une étape de plus.", "One region at a time, and a table that is not one more stop."),
    intro: L(
      "L’Italie sur mesure tient dans une région, parfois deux. Rome et la campagne romaine. La Toscane sans courir Florence et les Cinque Terre le même jour. Les lacs, ou les Pouilles, si l’été doit rester respirable.",
      "Tailor-made Italy fits in one region, sometimes two. Rome and the Roman countryside. Tuscany without running Florence and the Cinque Terre on the same day. The lakes, or Puglia, if summer is to stay breathable."
    ),
    when: L(
      "Avril à juin, et septembre à octobre, sont les mois les plus agréables dans les villes et les campagnes. Juillet et août sont chauds, surtout au sud, et les sites sont pleins. L’hiver convient aux villes, moins aux terrasses.",
      "April to June, and September to October, are the most pleasant months in the cities and the countryside. July and August are hot, especially in the south, and the sites are full. Winter suits the cities, less so the terraces."
    ),
    highlights: [
      L("Rome sur plusieurs nuits, pas comme une escale vers le sud.", "Rome over several nights, not as a stop on the way south."),
      L("Une campagne : Val d’Orcia, Ombrie, ou les collines au-dessus d’un lac.", "A countryside: the Val d’Orcia, Umbria, or the hills above a lake."),
      L("Une côte choisie, Amalfi ou les Pouilles, avec une base fixe.", "A chosen coast, Amalfi or Puglia, with a fixed base."),
      L("Les tables réservées aux heures où l’on dîne vraiment.", "Tables booked at the hour when you actually dine."),
    ],
    stays: [
      L("Ville et campagne voisine, une semaine.", "A city and the nearby countryside, one week."),
      L("Une seule région, villa ou petit hôtel.", "A single region, a villa or a small hotel."),
      L("Nord au printemps : lacs, puis une ville.", "The north in spring: the lakes, then a city."),
    ],
    idea: {
      title: L("Idée de voyage · une semaine en Toscane et à Rome", "Travel idea · one week in Tuscany and Rome"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 à 3", "Days 1 to 3"), text: L("Rome. Deux quartiers, un matin libre.", "Rome. Two districts, one free morning.") },
        { title: L("Jour 4", "Day 4"), text: L("Route ou train vers une base toscane.", "Road or train to a Tuscan base.") },
        { title: L("Jours 5 et 6", "Days 5 and 6"), text: L("La campagne autour, sans changer d’hôtel.", "The countryside around, without changing hotel.") },
        { title: L("Jour 7", "Day 7"), text: L("Retour, ou une nuit à Florence si le vol le demande.", "The way back, or a night in Florence if the flight needs it.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 2 h pour Rome ou Milan.", "From Paris, allow about 2 hours to Rome or Milan."),
    time: L("Même heure que Paris, hiver comme été.", "The same time as Paris, winter and summer."),
    formalities: L(
      "Espace Schengen. Une carte nationale d’identité française en cours de validité suffit.",
      "The Schengen area. A valid French national identity card is enough."
    ),
    themes: ["lune-de-miel", "culture", "road-trip"],
  },
  {
    slug: "grece",
    name: L("Grèce", "Greece"),
    continent: "europe",
    image: photo("photo-1533105079780-92b9be482077"),
    imageAlt: L("Santorin", "Santorini"),
    tagline: L("Athènes si elle sert, puis une île, pas cinq.", "Athens if it serves, then one island, not five."),
    intro: L(
      "La Grèce sur mesure choisit une mer. Les Cyclades ne se ressemblent pas. Le Dodécanèse et la mer Ionienne non plus. Une semaine tient dans Athènes et une île, ou dans une île seule si le vol arrive près.",
      "Tailor-made Greece chooses one sea. The Cyclades are not alike. Nor are the Dodecanese and the Ionian. A week fits Athens and one island, or one island alone if the flight lands nearby."
    ),
    when: L(
      "Mai, juin et septembre sont les bons mois : la mer est baignable ou le devient, les îles respirent. Juillet et août sont chauds et pris, surtout Santorin et Mykonos. Avril et octobre ouvrent les sites, avec des soirs plus frais.",
      "May, June and September are the good months: the sea is swimmable or becoming so, and the islands breathe. July and August are hot and booked, especially Santorini and Mykonos. April and October open the sites, with cooler evenings."
    ),
    highlights: [
      L("Athènes sur deux nuits, si le vol s’y pose.", "Athens for two nights, if the flight lands there."),
      L("Une île comme base : Naxos, Paros, ou une plus petite.", "One island as a base: Naxos, Paros, or a smaller one."),
      L("Une journée en bateau, pas un saut d’île chaque matin.", "A day on a boat, not an island hop every morning."),
      L("Les sites du Péloponnèse, si l’on reste sur le continent.", "The sites of the Peloponnese, if you stay on the mainland."),
    ],
    stays: [
      L("Athènes et une Cyclade.", "Athens and one Cycladic island."),
      L("Une île seule, hôtel ou maison.", "One island alone, a hotel or a house."),
      L("Continent : Athènes et le Péloponnèse, en voiture.", "The mainland: Athens and the Peloponnese, by car."),
    ],
    idea: {
      title: L("Idée de voyage · huit jours, Athènes et une île", "Travel idea · eight days, Athens and one island"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 et 2", "Days 1 and 2"), text: L("Athènes, sans programme du matin au soir.", "Athens, without a programme from morning to night.") },
        { title: L("Jour 3", "Day 3"), text: L("Vol ou ferry vers l’île. L’arrivée compte comme une journée.", "A flight or ferry to the island. The arrival counts as a day.") },
        { title: L("Jours 4 à 7", "Days 4 to 7"), text: L("L’île. Une sortie en bateau, le reste libre.", "The island. One boat trip, the rest free.") },
        { title: L("Jour 8", "Day 8"), text: L("Retour vers Athènes pour le vol, sans autre île.", "Back to Athens for the flight, with no other island.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 3 h 15 pour Athènes.", "From Paris, allow about 3 hours 15 minutes to Athens."),
    time: L("Une heure de plus qu’à Paris, toute l’année.", "One hour ahead of Paris, all year."),
    formalities: L(
      "Espace Schengen. Une carte nationale d’identité française en cours de validité suffit.",
      "The Schengen area. A valid French national identity card is enough."
    ),
    themes: ["lune-de-miel", "iles", "culture"],
  },
  {
    slug: "maroc",
    name: L("Maroc", "Morocco"),
    continent: "afrique",
    image: photo("photo-1489749798305-4fea3ae63d43"),
    imageAlt: L("Sud marocain", "Southern Morocco"),
    tagline: L("Une ville, puis le Sud si la route est le sujet.", "A city, then the south if the road is the point."),
    intro: L(
      "Le Maroc sur mesure sépare la médina et la route. Marrakech peut être la base, ou seulement la porte vers l’Atlas et le désert. Essaouira, Fès ou Tanger changent le voyage. On ne fait pas les quatre dans la même semaine.",
      "Tailor-made Morocco separates the medina and the road. Marrakech can be the base, or only the door to the Atlas and the desert. Essaouira, Fez or Tangier change the journey. You do not do all four in the same week."
    ),
    when: L(
      "Mars à mai, et septembre à novembre, conviennent aux villes et au Sud. L’été est très chaud à Marrakech et dans les vallées. La côte atlantique reste plus douce. L’hiver est doux en plaine, froid la nuit dans le désert, et enneigé dans le Haut Atlas.",
      "March to May, and September to November, suit the cities and the south. Summer is very hot in Marrakech and the valleys. The Atlantic coast stays milder. Winter is mild on the plain, cold at night in the desert, and snowy in the High Atlas."
    ),
    highlights: [
      L("Marrakech sur plusieurs nuits, avec des heures sans guide.", "Marrakech over several nights, with hours and no guide."),
      L("L’Atlas et une vallée, en voiture avec chauffeur.", "The Atlas and a valley, by car with a driver."),
      L("Une nuit dans le désert, si elle ne mange pas tout le voyage.", "A night in the desert, if it does not eat the whole trip."),
      L("Fès, si le sujet est la médina, pas la route.", "Fez, if the subject is the medina, not the road."),
    ],
    stays: [
      L("Marrakech et la campagne proche.", "Marrakech and the nearby countryside."),
      L("Route vers le Sud, trois nuits d’hôtel au plus.", "A road south, three hotel nights at most."),
      L("Côte et ville : Essaouira et Marrakech.", "Coast and city: Essaouira and Marrakech."),
    ],
    idea: {
      title: L("Idée de voyage · une semaine, Marrakech et le Sud", "Travel idea · one week, Marrakech and the south"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 à 3", "Days 1 to 3"), text: L("Marrakech. La médina, puis un jour dehors.", "Marrakech. The medina, then a day outside.") },
        { title: L("Jours 4 et 5", "Days 4 and 5"), text: L("Route dans l’Atlas, une vallée, une nuit.", "A road through the Atlas, a valley, one night.") },
        { title: L("Jour 6", "Day 6"), text: L("Retour vers Marrakech sans ajouter une autre ville.", "Back toward Marrakech without adding another city.") },
        { title: L("Jour 7", "Day 7"), text: L("Vol. La matinée reste à l’hôtel.", "The flight. The morning stays at the hotel.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 3 h pour Marrakech ou Casablanca.", "From Paris, allow about 3 hours to Marrakech or Casablanca."),
    time: L(
      "Le Maroc est à UTC+1, sans heure d’été. Même heure que Paris en hiver, une heure de moins en été. Pendant le ramadan, le pays peut passer à UTC+0.",
      "Morocco is on UTC+1, with no summer time. The same hour as Paris in winter, one hour behind in summer. During Ramadan the country can move to UTC+0."
    ),
    formalities: L(
      "Passeport français : pas de visa pour un séjour touristique d’au plus 90 jours. La carte d’identité ne suffit pas à l’embarquement.",
      "A French passport: no visa for a tourist stay of up to 90 days. A national identity card is not enough at check-in."
    ),
    themes: ["culture", "road-trip"],
  },
  {
    slug: "kenya-tanzanie",
    name: L("Kenya et Tanzanie", "Kenya and Tanzania"),
    continent: "afrique",
    featured: true,
    image: photo("photo-1516426122078-c23e76319801"),
    imageAlt: L("Savane", "Savanna"),
    tagline: L("La saison décide du parc, pas l’inverse.", "The season decides the park, not the other way round."),
    intro: L(
      "Un safari sur mesure part de la saison et du nombre de nuits en véhicule. Le Masai Mara, le Serengeti, le Ngorongoro ou Amboseli ne se visitent pas le même mois pour la même raison. Zanzibar s’ajoute seulement si les jours de piste sont déjà tenus.",
      "A tailor-made safari starts from the season and the number of nights in a vehicle. The Masai Mara, the Serengeti, the Ngorongoro or Amboseli are not visited in the same month for the same reason. Zanzibar is added only once the days on the track are already set."
    ),
    when: L(
      "Au Kenya, les mois plus secs sont janvier-février et juillet-octobre. Les longues pluies tombent surtout de mars à mai, les courtes en novembre et décembre. En Tanzanie, la grande migration se lit par secteur : sud du Serengeti autour de janvier à mars, puis vers le nord et le Mara de juillet à octobre. La piste est plus lourde pendant les pluies.",
      "In Kenya the drier months are January to February and July to October. The long rains fall mainly from March to May, the short rains in November and December. In Tanzania the great migration is read by area: the southern Serengeti around January to March, then toward the north and the Mara from July to October. The track is heavier in the rains."
    ),
    highlights: [
      L("Deux camps, pas quatre, pour une semaine.", "Two camps, not four, for one week."),
      L("Le Mara ou le Serengeti selon le mois, pas selon une habitude.", "The Mara or the Serengeti according to the month, not according to a habit."),
      L("Le Ngorongoro sur une journée ou une nuit, si l’on est déjà dans le nord tanzanien.", "The Ngorongoro for a day or a night, if you are already in northern Tanzania."),
      L("Zanzibar après le safari, avec de vraies nuits, pas une seule.", "Zanzibar after the safari, with real nights, not a single one."),
    ],
    stays: [
      L("Kenya seul : Nairobi ou un vol intérieur, puis un parc.", "Kenya alone: Nairobi or an internal flight, then one park."),
      L("Nord de la Tanzanie : Serengeti et cratère.", "Northern Tanzania: the Serengeti and the crater."),
      L("Safari puis côte, si le voyage dépasse dix jours.", "Safari then the coast, if the trip runs past ten days."),
    ],
    idea: {
      title: L("Idée de voyage · huit jours, un parc et une côte", "Travel idea · eight days, one park and a coast"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jour 1", "Day 1"), text: L("Arrivée à Nairobi ou Arusha. Pas de piste le soir même.", "Arrival in Nairobi or Arusha. No track the same evening.") },
        { title: L("Jours 2 à 5", "Days 2 to 5"), text: L("Un seul secteur de savane, deux camps au plus.", "A single stretch of savanna, two camps at most.") },
        { title: L("Jours 6 et 7", "Days 6 and 7"), text: L("Vol vers la côte, ou une nuit de plus au camp.", "A flight to the coast, or one more night at camp.") },
        { title: L("Jour 8", "Day 8"), text: L("Vol international.", "The international flight.") },
      ],
    },
    flight: L(
      "Depuis Paris, Nairobi est à environ 8 h 30 en vol direct. Kilimandjaro ou Zanzibar demandent souvent une escale : 10 à 14 h.",
      "From Paris, Nairobi is about 8 hours 30 minutes non-stop. Kilimanjaro or Zanzibar often need a connection: 10 to 14 hours."
    ),
    time: L(
      "Le Kenya et la Tanzanie sont à UTC+3. En hiver, 2 h de plus qu’à Paris. En été, 1 h.",
      "Kenya and Tanzania are on UTC+3. In winter, 2 hours ahead of Paris. In summer, 1."
    ),
    formalities: L(
      "Passeport français. Le Kenya demande une autorisation électronique (eTA) avant l’embarquement. La Tanzanie demande un visa, à obtenir avant le départ. Les deux règles se revérifient, elles changent.",
      "A French passport. Kenya requires an electronic travel authorisation (eTA) before boarding. Tanzania requires a visa, obtained before departure. Both rules should be checked again; they change."
    ),
    themes: ["safari"],
  },
  {
    slug: "afrique-du-sud",
    name: L("Afrique du Sud", "South Africa"),
    continent: "afrique",
    image: photo("photo-1580060839134-75a5edca2e99"),
    imageAlt: L("Le Cap", "Cape Town"),
    tagline: L("Le Cap, la route, ou le bush. Rarement les trois à la fois.", "Cape Town, the road, or the bush. Rarely all three at once."),
    intro: L(
      "L’Afrique du Sud sur mesure choisit un climat. Le Cap et le jardin en été austral. Le Kruger et le bush en saison sèche, quand l’herbe est basse. Relier les deux demande des jours, pas une nuit d’avion intérieure escamotée.",
      "Tailor-made South Africa chooses a climate. Cape Town and the Garden Route in the southern summer. Kruger and the bush in the dry season, when the grass is low. Linking the two takes days, not a domestic flight hidden in the night."
    ),
    when: L(
      "Au Cap, novembre à mars est l’été : sec, ventu, beau pour la côte. L’hiver austral, juin à août, est humide sur la péninsule et bon pour les baleines un peu plus tard. Dans le Kruger, la saison sèche de mai à septembre facilite l’observation. L’été y est chaud et vert, avec des orages.",
      "In Cape Town, November to March is summer: dry, windy, good for the coast. The southern winter, June to August, is wet on the peninsula and good for whales a little later. In Kruger, the dry season from May to September makes game easier to see. Summer there is hot and green, with storms."
    ),
    highlights: [
      L("Le Cap sur plusieurs nuits, pas comme une arrivée.", "Cape Town over several nights, not as an arrival."),
      L("La route des jardins, si la voiture est le sujet.", "The Garden Route, if the car is the point."),
      L("Un lodge dans le Kruger ou une réserve privée, en saison sèche.", "A lodge in Kruger or a private reserve, in the dry season."),
      L("Le Winelands sur une journée, depuis le Cap.", "The Winelands for a day, from Cape Town."),
    ],
    stays: [
      L("Le Cap et les vignobles.", "Cape Town and the vineyards."),
      L("Route côtière vers l’est, quelques nuits.", "A coastal road east, a few nights."),
      L("Bush seul, si le voyage est court.", "The bush alone, if the trip is short."),
    ],
    idea: {
      title: L("Idée de voyage · dix jours, Le Cap puis le bush", "Travel idea · ten days, Cape Town then the bush"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 à 4", "Days 1 to 4"), text: L("Le Cap. La montagne, la côte, une journée vignobles.", "Cape Town. The mountain, the coast, a day in the vineyards.") },
        { title: L("Jour 5", "Day 5"), text: L("Vol vers le nord-est. Arrivée au lodge dans l’après-midi.", "A flight to the north-east. Arrival at the lodge in the afternoon.") },
        { title: L("Jours 6 à 9", "Days 6 to 9"), text: L("Le bush. Deux sorties par jour suffisent.", "The bush. Two drives a day are enough.") },
        { title: L("Jour 10", "Day 10"), text: L("Vol vers Johannesburg et l’international.", "A flight to Johannesburg and the international connection.") },
      ],
    },
    flight: L(
      "Depuis Paris, comptez environ 11 h en vol direct pour Johannesburg. Le Cap demande souvent une escale, ou un vol intérieur.",
      "From Paris, allow about 11 hours non-stop to Johannesburg. Cape Town often needs a connection, or a domestic flight."
    ),
    time: L(
      "L’Afrique du Sud est à UTC+2, sans heure d’été. En hiver, 1 h de plus qu’à Paris. En été, la même heure.",
      "South Africa is on UTC+2, with no daylight saving. In winter, 1 hour ahead of Paris. In summer, the same time."
    ),
    formalities: L(
      "Passeport français : pas de visa pour un séjour touristique d’au plus 90 jours. Le passeport doit avoir des pages libres.",
      "A French passport: no visa for a tourist stay of up to 90 days. The passport needs free pages."
    ),
    themes: ["safari", "road-trip"],
  },
  {
    slug: "seychelles",
    name: L("Seychelles", "Seychelles"),
    continent: "ocean-indien",
    image: photo("photo-1540202404-a2f29016b523"),
    imageAlt: L("Plage et granit", "Beach and granite"),
    tagline: L("Mahé, Praslin ou La Digue. Deux îles au plus.", "Mahé, Praslin or La Digue. Two islands at most."),
    intro: L(
      "Les Seychelles se tiennent dans peu d’îles. Mahé a les vols et les plages plus longues. Praslin a la vallée et les criques. La Digue se fait sans voiture, ou presque. Le sur-mesure évite d’en visiter une troisième « pour voir ».",
      "The Seychelles sit in a few islands. Mahé has the flights and the longer beaches. Praslin has the valley and the coves. La Digue is done without a car, or almost. Tailor-made travel avoids a third island “just to see”."
    ),
    when: L(
      "Le temps est tropical toute l’année. De mai à septembre, l’alizé du sud-est rend Mahé et Praslin plus secs, avec une mer parfois plus forte. D’octobre à avril, il pleut davantage, l’air est plus lourd, et la mer peut être plus calme. Les mois de transition, avril-mai et octobre, sont souvent les plus doux.",
      "The weather is tropical all year. From May to September the south-east trade wind makes Mahé and Praslin drier, with a sea that can be rougher. From October to April it rains more, the air is heavier, and the sea can be calmer. The transition months, April to May and October, are often the gentlest."
    ),
    highlights: [
      L("Une plage de Mahé sans programme collé.", "A Mahé beach with no programme attached."),
      L("Praslin et la Vallée de Mai, sur une demi-journée.", "Praslin and the Vallée de Mai, over half a day."),
      L("La Digue à vélo, une ou deux nuits.", "La Digue by bike, one or two nights."),
      L("Une île plus petite seulement si les nuits sont déjà nombreuses.", "A smaller island only if the nights are already many."),
    ],
    stays: [
      L("Mahé seul, hôtel ou villa.", "Mahé alone, a hotel or a villa."),
      L("Mahé et Praslin.", "Mahé and Praslin."),
      L("Praslin et La Digue, si l’arrivée se fait vite.", "Praslin and La Digue, if the arrival is quick."),
    ],
    idea: {
      title: L("Idée de voyage · une semaine, deux îles", "Travel idea · one week, two islands"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 à 4", "Days 1 to 4"), text: L("Mahé. Plages, et une journée sans excursion.", "Mahé. Beaches, and a day with no excursion.") },
        { title: L("Jour 5", "Day 5"), text: L("Ferry ou petit vol vers Praslin.", "A ferry or a short flight to Praslin.") },
        { title: L("Jours 6 et 7", "Days 6 and 7"), text: L("Praslin, et La Digue à la journée si la mer le permet.", "Praslin, and La Digue for a day if the sea allows.") },
        { title: L("Jour 8", "Day 8"), text: L("Retour vers Mahé pour le vol.", "Back to Mahé for the flight.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 10 à 12 h, avec une escale.", "From Paris, allow about 10 to 12 hours, with a connection."),
    time: L("Les Seychelles sont à UTC+4. En hiver, 3 h de plus qu’à Paris. En été, 2 h.", "The Seychelles are on UTC+4. In winter, 3 hours ahead of Paris. In summer, 2."),
    formalities: L(
      "Passeport français : pas de visa demandé à l’avance. Un permis de visiteur est délivré à l’arrivée, pour un séjour touristique. Le passeport doit couvrir le séjour.",
      "A French passport: no visa is required in advance. A visitor’s permit is issued on arrival, for a tourist stay. The passport must cover the stay."
    ),
    themes: ["lune-de-miel", "iles"],
  },
  {
    slug: "maurice",
    name: L("Maurice", "Mauritius"),
    continent: "ocean-indien",
    image: photo("photo-1507525428034-b723cf961d3e"),
    imageAlt: L("Plage de l’océan Indien", "An Indian Ocean beach"),
    tagline: L("Une côte, un hôtel, et l’île si l’on sort.", "One coast, one hotel, and the island if you go out."),
    intro: L(
      "Maurice se choisit par la côte. L’ouest est plus sec. L’est est plus vert, plus exposé à l’alizé. Le sud est plus ouvert. Le sur-mesure décide si l’hôtel suffit, ou si des journées partent vers Chamarel, un domaine, ou la mer au large.",
      "Mauritius is chosen by the coast. The west is drier. The east is greener, more open to the trade wind. The south is more exposed. Tailor-made travel decides whether the hotel is enough, or whether days go out to Chamarel, an estate, or the sea offshore."
    ),
    when: L(
      "De mai à novembre, l’hiver austral est plus sec et plus frais, surtout le soir. De décembre à avril, l’été est chaud, plus humide, et c’est la saison cyclonique. La mer reste chaude presque toute l’année. L’ouest abrite mieux du vent que l’est.",
      "From May to November the southern winter is drier and cooler, especially in the evening. From December to April summer is hot, wetter, and it is the cyclone season. The sea stays warm almost all year. The west shelters you from the wind better than the east."
    ),
    highlights: [
      L("Une plage de l’ouest ou du nord, selon le vent.", "A beach in the west or the north, depending on the wind."),
      L("Les terres hautes et Chamarel, sur une journée.", "The highlands and Chamarel, over one day."),
      L("Un domaine ou une table, pas une liste de restaurants.", "An estate or a table, not a list of restaurants."),
      L("La mer au large, si la navigation est le sujet.", "The sea offshore, if sailing is the point."),
    ],
    stays: [
      L("Un seul hôtel, une côte.", "A single hotel, one coast."),
      L("Hôtel et deux journées dans l’île.", "A hotel and two days out on the island."),
      L("Villa, si le voyage est en famille ou à plusieurs.", "A villa, if the trip is with family or a group."),
    ],
    idea: {
      title: L("Idée de voyage · une semaine, une côte", "Travel idea · one week, one coast"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 à 3", "Days 1 to 3"), text: L("L’hôtel et la mer. Rien d’autre.", "The hotel and the sea. Nothing else.") },
        { title: L("Jour 4", "Day 4"), text: L("Les hautes terres, retour le soir.", "The highlands, back in the evening.") },
        { title: L("Jours 5 et 6", "Days 5 and 6"), text: L("Encore la côte, ou une sortie en mer.", "The coast again, or a day at sea.") },
        { title: L("Jour 7", "Day 7"), text: L("Vol de nuit ou de jour, selon l’horaire réel.", "A night or day flight, according to the real timetable.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 11 h en vol direct.", "From Paris, allow about 11 hours non-stop."),
    time: L("Maurice est à UTC+4. En hiver, 3 h de plus qu’à Paris. En été, 2 h.", "Mauritius is on UTC+4. In winter, 3 hours ahead of Paris. In summer, 2."),
    formalities: L(
      "Passeport français : pas de visa pour un séjour touristique court. Le passeport doit couvrir le séjour.",
      "A French passport: no visa for a short tourist stay. The passport must cover the stay."
    ),
    themes: ["lune-de-miel", "iles"],
  },
  {
    slug: "bali",
    name: L("Bali", "Bali"),
    continent: "asie",
    image: photo("photo-1537996194471-e657df975ab4"),
    imageAlt: L("Temple à Bali", "A temple in Bali"),
    tagline: L("Le sud pour arriver, le centre ou la côte pour rester.", "The south to arrive, the centre or the coast to stay."),
    intro: L(
      "Bali se découpe. Le sud sert les vols et peut s’arrêter là. Ubud demande des nuits, pas une excursion. La côte est, Candi Dasa ou la région d’Amed, change l’île. Le sur-mesure refuse d’ajouter une troisième base « parce que c’est près ».",
      "Bali divides. The south serves the flights and can stop there. Ubud needs nights, not an excursion. The east coast, Candi Dasa or the Amed area, changes the island. Tailor-made travel refuses a third base “because it is close”."
    ),
    when: L(
      "La saison sèche va d’avril à octobre. De novembre à mars, la mousson apporte des pluies, souvent en averses, et des rizières plus vertes. Juillet et août sont les plus fréquentés. Mai, juin et septembre laissent plus d’air.",
      "The dry season runs from April to October. From November to March the monsoon brings rain, often in showers, and greener rice fields. July and August are the busiest. May, June and September leave more room."
    ),
    highlights: [
      L("Ubud et les rizières, à condition d’y dormir.", "Ubud and the rice fields, provided you sleep there."),
      L("Un temple, un seul matin, pas une tournée.", "A temple, one morning, not a tour."),
      L("La côte est, plus calme que le sud.", "The east coast, quieter than the south."),
      L("Une journée sans voiture.", "A day without a car."),
    ],
    stays: [
      L("Sud seul, si le voyage est court.", "The south alone, if the trip is short."),
      L("Sud et Ubud.", "The south and Ubud."),
      L("Ubud et la côte est, en laissant le sud à l’aéroport.", "Ubud and the east coast, leaving the south to the airport."),
    ],
    idea: {
      title: L("Idée de voyage · neuf jours, Ubud et la côte", "Travel idea · nine days, Ubud and the coast"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jour 1", "Day 1"), text: L("Arrivée à Denpasar. Nuit dans le sud, sans visite.", "Arrival in Denpasar. A night in the south, with no sightseeing.") },
        { title: L("Jours 2 à 5", "Days 2 to 5"), text: L("Ubud. Rizières, et des heures libres.", "Ubud. Rice fields, and free hours.") },
        { title: L("Jours 6 à 8", "Days 6 to 8"), text: L("Côte est. La mer, peu de route.", "The east coast. The sea, little driving.") },
        { title: L("Jour 9", "Day 9"), text: L("Retour vers l’aéroport.", "Back to the airport.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 16 à 18 h, avec une escale.", "From Paris, allow about 16 to 18 hours, with a connection."),
    time: L("Bali est à UTC+8. En hiver, 7 h de plus qu’à Paris. En été, 6 h.", "Bali is on UTC+8. In winter, 7 hours ahead of Paris. In summer, 6."),
    formalities: L(
      "Passeport français, valable plus de six mois, en bon état. Un visa à l’arrivée, payant, couvre un séjour touristique de 30 jours. Il faut aussi la carte d’arrivée en ligne, et à Bali une taxe touristique locale. L’agence revérifie les montants et les sites officiels.",
      "A French passport, valid for more than six months, in good condition. A paid visa on arrival covers a 30-day tourist stay. The online arrival card is also required, and in Bali a local tourist tax. The agency checks the amounts and the official sites again."
    ),
    themes: ["lune-de-miel", "iles", "culture"],
  },
  {
    slug: "thailande",
    name: L("Thaïlande", "Thailand"),
    continent: "asie",
    image: photo("photo-1552465011-b4e21bf6e79a"),
    imageAlt: L("Côte thaïlandaise", "The Thai coast"),
    tagline: L("Bangkok si elle sert, puis une côte, pas les deux mers.", "Bangkok if it serves, then one coast, not both seas."),
    intro: L(
      "La Thaïlande sur mesure choisit une mer. La mer d’Andaman, autour de Phuket, et le golfe, autour de Samui, n’ont pas la même saison. Le nord, Chiang Mai, est un autre voyage. Les relier tous les trois en dix jours défait le séjour.",
      "Tailor-made Thailand chooses one sea. The Andaman Sea, around Phuket, and the gulf, around Samui, do not share a season. The north, Chiang Mai, is another journey. Linking all three in ten days undoes the stay."
    ),
    when: L(
      "De novembre à février, le nord et Bangkok sont plus frais et plus secs. Sur l’Andaman, la mer est plus calme à peu près de novembre à avril. Le golfe, côté Samui, est souvent meilleur de décembre à avril aussi, mais les pluies n’y tombent pas aux mêmes semaines que sur l’Andaman : de mai à octobre, une côte peut être praticable quand l’autre ne l’est pas. On choisit la côte après le mois.",
      "From November to February the north and Bangkok are cooler and drier. On the Andaman the sea is calmer roughly from November to April. The gulf, on the Samui side, is often best from December to April as well, but the rains do not fall in the same weeks as on the Andaman: from May to October one coast can be workable when the other is not. The coast is chosen after the month."
    ),
    highlights: [
      L("Bangkok sur deux nuits, si le vol s’y pose.", "Bangkok for two nights, if the flight lands there."),
      L("Une île ou une côte comme base.", "One island or one coast as a base."),
      L("Le nord en saison sèche, temples et campagne.", "The north in the dry season, temples and countryside."),
      L("Un bateau entre deux plages, pas un nouvel hôtel chaque soir.", "A boat between two beaches, not a new hotel every night."),
    ],
    stays: [
      L("Bangkok et une côte.", "Bangkok and one coast."),
      L("La côte seule, vol intérieur direct.", "The coast alone, a direct domestic flight."),
      L("Le nord, si la mer n’est pas le sujet.", "The north, if the sea is not the point."),
    ],
    idea: {
      title: L("Idée de voyage · dix jours, Bangkok et une mer", "Travel idea · ten days, Bangkok and one sea"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 et 2", "Days 1 and 2"), text: L("Bangkok. Le fleuve, un quartier, le reste libre.", "Bangkok. The river, one district, the rest free.") },
        { title: L("Jour 3", "Day 3"), text: L("Vol vers la côte choisie selon le mois.", "A flight to the coast chosen for the month.") },
        { title: L("Jours 4 à 9", "Days 4 to 9"), text: L("Une base. Une journée en bateau.", "One base. One day by boat.") },
        { title: L("Jour 10", "Day 10"), text: L("Retour vers Bangkok pour le vol, sans autre ville.", "Back to Bangkok for the flight, with no other city.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 11 h en vol direct pour Bangkok.", "From Paris, allow about 11 hours non-stop to Bangkok."),
    time: L("La Thaïlande est à UTC+7. En hiver, 6 h de plus qu’à Paris. En été, 5 h.", "Thailand is on UTC+7. In winter, 6 hours ahead of Paris. In summer, 5."),
    formalities: L(
      "Passeport français, valable au moins six mois. Depuis septembre 2026, un séjour touristique sans visa est limité à 30 jours, et à deux entrées sans visa par année civile. La carte d’arrivée numérique (TDAC) se remplit avant le vol. Au-delà de 30 jours, un visa est nécessaire. L’agence revérifie la règle.",
      "A French passport, valid for at least six months. Since September 2026 a tourist stay without a visa is limited to 30 days, and to two visa-free entries per calendar year. The digital arrival card (TDAC) is filled in before the flight. Beyond 30 days a visa is required. The agency checks the rule again."
    ),
    themes: ["iles", "culture"],
  },
  {
    slug: "ouest-americain",
    name: L("Ouest américain", "American West"),
    continent: "ameriques",
    image: photo("photo-1509316785289-025f5b846b35"),
    imageAlt: L("Désert de l’Ouest américain", "Desert in the American West"),
    tagline: L("Une route, des parcs, et des distances qui sont des journées.", "One road, the parks, and distances that are whole days."),
    intro: L(
      "L’Ouest américain sur mesure accepte les kilomètres. Un parc national n’est pas une halte d’une heure. La Californie côtière, les déserts de l’Utah et de l’Arizona, ou les Rocheuses, sont trois voyages. On en choisit un.",
      "The tailor-made American West accepts the kilometres. A national park is not a one-hour stop. The California coast, the deserts of Utah and Arizona, or the Rockies, are three journeys. You choose one."
    ),
    when: L(
      "La côte californienne se visite presque toute l’année. Septembre à novembre y est souvent clair. Les déserts sont beaux de mars à mai et en automne. L’été y dépasse facilement 40 °C. Les parcs d’altitude, Yosemite ou les Rocheuses, ouvrent vraiment leurs routes l’été. L’hiver est la saison du ski, pas des hauts cols.",
      "The California coast can be visited almost all year. September to November is often clear. The deserts are beautiful from March to May and in autumn. In summer they easily pass 40 °C. High parks, Yosemite or the Rockies, really open their roads in summer. Winter is the ski season, not the season of the high passes."
    ),
    highlights: [
      L("Un parc pour plusieurs nuits : Zion, Yosemite, ou le Grand Canyon sur un bord.", "One park for several nights: Zion, Yosemite, or one rim of the Grand Canyon."),
      L("La route côtière, si la voiture est lente et le sujet.", "The coastal road, if the car is slow and is the point."),
      L("Los Angeles ou San Francisco comme porte, pas comme une liste.", "Los Angeles or San Francisco as a door, not as a list."),
      L("Des étapes courtes en kilomètres affichés, longues en heures.", "Stages that look short in kilometres and are long in hours."),
    ],
    stays: [
      L("Utah et Arizona, une route de déserts.", "Utah and Arizona, a desert road."),
      L("Californie : une ville et la côte.", "California: one city and the coast."),
      L("Un parc et une ville, si le voyage dure une semaine.", "One park and one city, if the trip lasts a week."),
    ],
    idea: {
      title: L("Idée de voyage · dix jours, les déserts", "Travel idea · ten days, the deserts"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 et 2", "Days 1 and 2"), text: L("Las Vegas ou Phoenix, puis la route dès le matin du deuxième jour.", "Las Vegas or Phoenix, then the road from the morning of the second day.") },
        { title: L("Jours 3 à 5", "Days 3 to 5"), text: L("Zion ou Bryce, avec des nuits au même endroit.", "Zion or Bryce, with nights in the same place.") },
        { title: L("Jours 6 à 8", "Days 6 to 8"), text: L("Vers le Grand Canyon ou Monument Valley, sans troisième parc le même jour.", "Toward the Grand Canyon or Monument Valley, without a third park the same day.") },
        { title: L("Jours 9 et 10", "Days 9 and 10"), text: L("Retour vers l’aéroport, une nuit en ville.", "Back to the airport, one night in a city.") },
      ],
    },
    flight: L(
      "Depuis Paris, Los Angeles ou San Francisco : environ 11 h 30 en vol direct. Las Vegas ou Phoenix passent souvent par une escale.",
      "From Paris, Los Angeles or San Francisco: about 11 hours 30 minutes non-stop. Las Vegas or Phoenix often go through a connection."
    ),
    time: L(
      "La côte Ouest est à UTC−8 l’hiver et UTC−7 l’été. Elle a environ 9 h de moins que Paris, toute l’année.",
      "The West Coast is on UTC−8 in winter and UTC−7 in summer. It is about 9 hours behind Paris, all year."
    ),
    formalities: L(
      "Passeport français et autorisation ESTA, demandée avant le départ. Le passeport doit être biométrique et couvrir le séjour.",
      "A French passport and an ESTA authorisation, requested before departure. The passport must be biometric and cover the stay."
    ),
    themes: ["road-trip"],
  },
  {
    slug: "islande",
    name: L("Islande", "Iceland"),
    continent: "europe",
    featured: true,
    image: photo("photo-1476610182048-b716b8518aae"),
    imageAlt: L("Paysage d’Islande", "An Icelandic landscape"),
    tagline: L("La route circulaire n’est pas une obligation.", "The ring road is not an obligation."),
    intro: L(
      "L’Islande sur mesure choisit une saison et une portion d’île. L’été ouvre les hautes terres. L’hiver concentre le sud et les aurores, avec des routes qui ferment. Faire le tour de l’île en une semaine n’est pas un rythme, c’est une course.",
      "Tailor-made Iceland chooses a season and a portion of the island. Summer opens the highlands. Winter concentrates on the south and the aurora, with roads that close. Driving round the island in a week is not a pace, it is a race."
    ),
    when: L(
      "Juin à août : jours très longs, pistes des hautes terres ouvertes si la fonte le permet, plus de monde sur le Cercle d’or. Septembre et mai sont des seuils, avec des jours corrects et moins de cars. De septembre à mars, la nuit permet les aurores, le jour est court, et le vent décide les sorties.",
      "June to August: very long days, highland tracks open if the thaw allows, more people on the Golden Circle. September and May are thresholds, with decent days and fewer coaches. From September to March the night allows the aurora, the day is short, and the wind decides the outings."
    ),
    highlights: [
      L("Le sud : cascades, plages noires, un glacier, sur plusieurs nuits.", "The south: waterfalls, black beaches, a glacier, over several nights."),
      L("Reykjavík comme porte, deux nuits au plus si la route prime.", "Reykjavik as a door, two nights at most if the road comes first."),
      L("Une baignade chaude, pas comme unique sujet.", "A hot soak, not as the only subject."),
      L("Les hautes terres seulement l’été, et seulement si la piste est ouverte.", "The highlands only in summer, and only if the track is open."),
    ],
    stays: [
      L("Le sud, en été ou en hiver.", "The south, in summer or in winter."),
      L("Reykjavík et le Cercle d’or, si le voyage est court.", "Reykjavik and the Golden Circle, if the trip is short."),
      L("Le tour de l’île, seulement au-delà de dix jours.", "The ring of the island, only beyond ten days."),
    ],
    idea: {
      title: L("Idée de voyage · une semaine dans le sud", "Travel idea · one week in the south"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 et 2", "Days 1 and 2"), text: L("Reykjavík, et le Cercle d’or sur une journée.", "Reykjavik, and the Golden Circle for one day.") },
        { title: L("Jours 3 à 6", "Days 3 to 6"), text: L("La côte sud, deux bases. Pas de retour à la capitale chaque soir.", "The south coast, two bases. No return to the capital every evening.") },
        { title: L("Jour 7", "Day 7"), text: L("Route vers l’aéroport, avec une marge pour le vent.", "The road to the airport, with a margin for the wind.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 3 h 30 en vol direct.", "From Paris, allow about 3 hours 30 minutes non-stop."),
    time: L(
      "L’Islande est à UTC+0 toute l’année. En hiver, 1 h de moins qu’à Paris. En été, 2 h.",
      "Iceland is on UTC+0 all year. In winter, 1 hour behind Paris. In summer, 2."
    ),
    formalities: L(
      "Espace Schengen. Une carte nationale d’identité française en cours de validité suffit.",
      "The Schengen area. A valid French national identity card is enough."
    ),
    themes: ["grand-nord", "road-trip"],
  },
  {
    slug: "laponie",
    name: L("Laponie", "Lapland"),
    continent: "europe",
    image: photo("photo-1483664852095-d6cc6870702d"),
    imageAlt: L("Nuit d’hiver dans le Nord", "A winter night in the North"),
    tagline: L("L’hiver pour la nuit, l’été pour le jour qui ne tombe pas.", "Winter for the night, summer for the day that does not fall."),
    intro: L(
      "La Laponie dont on parle ici est d’abord finlandaise, autour de Rovaniemi et plus au nord, avec la Suède et la Norvège si la route ou le train s’y prêtent. Ce n’est pas le même séjour en décembre et en juin. Le sur-mesure choisit la lumière.",
      "The Lapland meant here is first Finnish, around Rovaniemi and further north, with Sweden and Norway if the road or the train suits. It is not the same stay in December and in June. Tailor-made travel chooses the light."
    ),
    when: L(
      "De décembre à mars, la neige tient, le jour est très court, et les aurores se cherchent par nuit claire. Autour du solstice, le soleil ne se lève pas au nord. Juin et juillet apportent le soleil de minuit, les lacs et la randonnée, sans neige. Septembre colore les arbres avant la nuit.",
      "From December to March the snow holds, the day is very short, and the aurora is looked for on a clear night. Around the solstice the sun does not rise in the north. June and July bring the midnight sun, the lakes and hiking, without snow. September colours the trees before the dark."
    ),
    highlights: [
      L("Une base, pas un nouveau village chaque nuit.", "One base, not a new village every night."),
      L("La forêt et un lac, en raquettes ou à pied selon la saison.", "The forest and a lake, on snowshoes or on foot depending on the season."),
      L("Une nuit prévue pour le ciel, sans garantie d’aurore.", "A night set aside for the sky, with no guarantee of aurora."),
      L("Rovaniemi comme porte, pas comme tout le voyage.", "Rovaniemi as a door, not as the whole journey."),
    ],
    stays: [
      L("Hiver, un lodge au nord de Rovaniemi.", "Winter, a lodge north of Rovaniemi."),
      L("Été, lacs et randonnée, mêmes nuits répétées.", "Summer, lakes and hiking, the same nights repeated."),
      L("Train de nuit depuis le sud de la Finlande, si le vol se pose à Helsinki.", "A night train from southern Finland, if the flight lands in Helsinki."),
    ],
    idea: {
      title: L("Idée de voyage · cinq jours d’hiver", "Travel idea · five winter days"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix. L’aurore ne se commande pas.", "A suggested pace, not a packaged tour, and not a price. The aurora cannot be ordered."),
      beats: [
        { title: L("Jour 1", "Day 1"), text: L("Vol vers Rovaniemi. Nuit sur place.", "A flight to Rovaniemi. The night there.") },
        { title: L("Jours 2 à 4", "Days 2 to 4"), text: L("Une base plus au nord. Forêt, et une veille si le ciel est clair.", "A base further north. Forest, and a watch if the sky is clear.") },
        { title: L("Jour 5", "Day 5"), text: L("Retour vers le vol, avec de la marge.", "Back to the flight, with a margin.") },
      ],
    },
    flight: L(
      "Depuis Paris, Rovaniemi est à environ 4 h en vol direct en saison. Sinon, via Helsinki, comptez 6 à 8 h.",
      "From Paris, Rovaniemi is about 4 hours non-stop in season. Otherwise, via Helsinki, allow 6 to 8 hours."
    ),
    time: L(
      "La Laponie finlandaise est à UTC+2 l’hiver et UTC+3 l’été. Une heure de plus qu’à Paris, toute l’année.",
      "Finnish Lapland is on UTC+2 in winter and UTC+3 in summer. One hour ahead of Paris, all year."
    ),
    formalities: L(
      "Finlande, Suède et Norvège sont dans l’espace Schengen. Une carte nationale d’identité française en cours de validité suffit.",
      "Finland, Sweden and Norway are in the Schengen area. A valid French national identity card is enough."
    ),
    themes: ["grand-nord"],
  },
  {
    slug: "perou",
    name: L("Pérou", "Peru"),
    continent: "ameriques",
    image: photo("photo-1526392060635-9d6019884377"),
    imageAlt: L("Machu Picchu", "Machu Picchu"),
    tagline: L("Lima, puis l’altitude, avec des nuits pour s’y faire.", "Lima, then the altitude, with nights to adjust."),
    intro: L(
      "Le Pérou sur mesure ne pose pas Lima, Cusco et l’Amazonie dans le même souffle. L’altitude du Cusco se gagne. La Vallée sacrée sert souvent de palier. Machu Picchu est une journée, parfois deux, pas le seul matin du voyage.",
      "Tailor-made Peru does not set Lima, Cusco and the Amazon in the same breath. The altitude of Cusco is earned. The Sacred Valley is often a step. Machu Picchu is a day, sometimes two, not the only morning of the trip."
    ),
    when: L(
      "Sur les Andes et autour de Cusco, la saison sèche va de mai à septembre : jours clairs, nuits froides, sentiers praticables. De novembre à mars, les pluies verdissent la vallée et peuvent fermer des chemins. Lima, sur la côte, est aride. De juin à octobre, le ciel y reste souvent gris. L’Amazonie est plus lourde pendant les pluies andines.",
      "In the Andes and around Cusco, the dry season runs from May to September: clear days, cold nights, usable paths. From November to March the rains green the valley and can close trails. Lima, on the coast, is arid. From June to October the sky there often stays grey. The Amazon is heavier during the Andean rains."
    ),
    highlights: [
      L("Lima sur deux nuits, pour le vol et la table, pas pour tout voir.", "Lima for two nights, for the flight and the table, not to see everything."),
      L("La Vallée sacrée avant Cusco, pour l’altitude.", "The Sacred Valley before Cusco, for the altitude."),
      L("Machu Picchu avec une nuit à Aguas Calientes, ou un retour le jour même si les horaires tiennent.", "Machu Picchu with a night in Aguas Calientes, or a same-day return if the timetables hold."),
      L("L’Amazonie seulement si une semaine andine est déjà prévue.", "The Amazon only if an Andean week is already planned."),
    ],
    stays: [
      L("Lima et Cusco, une semaine.", "Lima and Cusco, one week."),
      L("Vallée sacrée, Cusco, Machu Picchu.", "The Sacred Valley, Cusco, Machu Picchu."),
      L("Andes puis quelques nuits en Amazonie, sur dix à douze jours.", "The Andes then a few nights in the Amazon, over ten to twelve days."),
    ],
    idea: {
      title: L("Idée de voyage · neuf jours, la Vallée et Cusco", "Travel idea · nine days, the Valley and Cusco"),
      note: L("Suggestion de rythme, pas un circuit vendu, pas un prix.", "A suggested pace, not a packaged tour, and not a price."),
      beats: [
        { title: L("Jours 1 et 2", "Days 1 and 2"), text: L("Lima. Le vol de nuit se récupère.", "Lima. The night flight is recovered.") },
        { title: L("Jours 3 à 5", "Days 3 to 5"), text: L("La Vallée sacrée, plus bas que Cusco.", "The Sacred Valley, lower than Cusco.") },
        { title: L("Jours 6 et 7", "Days 6 and 7"), text: L("Cusco, puis Machu Picchu.", "Cusco, then Machu Picchu.") },
        { title: L("Jours 8 et 9", "Days 8 and 9"), text: L("Retour à Lima pour le vol.", "Back to Lima for the flight.") },
      ],
    },
    flight: L("Depuis Paris, comptez environ 13 h en vol direct pour Lima.", "From Paris, allow about 13 hours non-stop to Lima."),
    time: L(
      "Le Pérou est à UTC−5, sans heure d’été. En hiver, 6 h de moins qu’à Paris. En été, 7 h.",
      "Peru is on UTC−5, with no daylight saving. In winter, 6 hours behind Paris. In summer, 7."
    ),
    formalities: L(
      "Passeport français : pas de visa pour un séjour touristique. Le passeport doit avoir au moins six mois de validité à l’arrivée. La durée accordée, au plus 90 jours, se vérifie sur le tampon.",
      "A French passport: no visa for a tourist stay. The passport must have at least six months of validity on arrival. The time granted, at most 90 days, is checked on the stamp."
    ),
    themes: ["culture"],
  },
];

export function destinationBySlug(slug: string) {
  return DESTINATIONS.find((item) => item.slug === slug) ?? null;
}

export function destinationsIn(continent: ContinentId) {
  return DESTINATIONS.filter((item) => item.continent === continent);
}

export function destinationsForTheme(theme: ThemeId) {
  return DESTINATIONS.filter((item) => item.themes.includes(theme));
}

export function themeById(id: string) {
  return THEMES.find((item) => item.id === id) ?? null;
}
