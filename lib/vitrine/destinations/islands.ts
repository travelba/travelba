import type { Destination } from "../types";

export const islands: Destination[] = [
  {
    slug: "republique-dominicaine",
    name: "République dominicaine",
    region: "caraibes",
    image: "photo-1551918120-9739cb430c6d",
    alt: "Sable blanc",
    line: "Amanera, puis Casa de Campo.",
    essay:
      "Amanera, puis Casa de Campo — 7 jours / 6 nuits.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "République dominicaine",
        title: "Les falaises, puis le domaine",
        duration: "7 jours / 6 nuits",
        season: "Décembre à avril.",
        lede: "On arrive près de Puerto Plata pour Amanera.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Playa Grande",
            text: "Accueil à l’aéroport.",
            stay: "Amanera",
          },
          {
            when: "Jour 4",
            title: "La falaise",
            text: "Une journée sans sortie.",
            stay: "Amanera",
          },
          {
            when: "Jours 5 et 6",
            title: "La Romana",
            text: "Vol ou route vers le sud-est.",
            stay: "Casa de Campo",
          },
          {
            when: "Jour 7",
            title: "Le départ",
            text: "Vers l’aéroport de Punta Cana ou de La Romana.",
            stay: "Transfert tenu",
          },
        ],
        houses: [
          { name: "Amanera", where: "Playa Grande", note: "Les falaises au-dessus des Caraïbes." },
          { name: "Casa de Campo", where: "La Romana", note: "Le domaine, la marina." },
        ],
        experiences: [
          "Accueil à l’arrivée",
          "Journées libres sur les falaises",
          "Altos de Chavón",
          "Transfert entre les deux maisons",
        ],
      },
    ],
  },
  {
    slug: "ile-maurice",
    name: "Île Maurice",
    region: "pacifique",
    image: "photo-1540202404-a2f29016b523",
    alt: "Granit, sable et lagon",
    line: "Saint Géran, puis Anahita.",
    essay:
      "Saint Géran, puis Anahita — 8 jours / 7 nuits.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Île Maurice",
        title: "Deux lagons",
        duration: "8 jours / 7 nuits",
        season: "Mai à décembre, et plus précisément mai, juin.",
        lede: "Accueil à l’aéroport, voiture, lagon.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Belle Mare",
            text: "Accueil à l’aéroport, puis le lagon.",
            stay: "One&Only Le Saint Géran",
          },
          {
            when: "Jour 4",
            title: "Les îles du nord",
            text: "Un bateau.",
            stay: "One&Only Le Saint Géran",
          },
          {
            when: "Jours 5 à 7",
            title: "Anahita",
            text: "L’autre côte est.",
            stay: "Four Seasons Resort Mauritius at Anahita",
          },
          {
            when: "Jour 8",
            title: "Le départ",
            text: "Voiture vers l’aéroport, accueil.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "One&Only Le Saint Géran", where: "Belle Mare", note: "Le lagon du nord-est." },
          { name: "Four Seasons Anahita", where: "Côte est", note: "Le second matin." },
        ],
        experiences: [
          "Bateau vers les îles du nord",
          "Deux maisons, un seul changement",
          "Hélicoptère sur demande",
          "Accueil à l’aéroport",
        ],
      },
    ],
  },
  {
    slug: "seychelles",
    name: "Seychelles",
    region: "pacifique",
    image: "photo-1540202404-a2f29016b523",
    alt: "Rochers de granit",
    line: "Mahé, puis North Island.",
    essay:
      "Mahé, puis North Island — 9 jours / 8 nuits.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Seychelles",
        title: "L’île grande, puis l’île privée",
        duration: "9 jours / 8 nuits",
        season: "Avril, mai, octobre et novembre, entre les alizés.",
        lede: "Trois nuits pour Mahé.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Mahé",
            text: "Accueil à l’aéroport.",
            stay: "Four Seasons Resort Seychelles",
          },
          {
            when: "Jour 3",
            title: "Le passage",
            text: "Hélicoptère vers North Island.",
            stay: "North Island",
          },
          {
            when: "Jours 4 à 8",
            title: "North Island",
            text: "Hélicoptère vers l’île.",
            stay: "North Island",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Retour vers Mahé, correspondance.",
            stay: "L’hélicoptère du matin",
          },
        ],
        houses: [
          { name: "Four Seasons Resort Seychelles", where: "Mahé", note: "Petite Anse, les granits." },
          { name: "North Island", where: "North Island", note: "L’île privée, les villas." },
        ],
        experiences: [
          "Hélicoptère entre Mahé et North Island",
          "Journées sans programme sur l’île",
          "Bateau autour de North Island",
          "Accueil à Mahé",
        ],
      },
    ],
  },
  {
    slug: "australie",
    name: "Australie",
    region: "pacifique",
    image: "photo-1506973035872-a4ec16b8e8d9",
    alt: "Toits blancs",
    line: "Sydney, Uluru, la Tasmanie.",
    essay:
      "Sydney, Uluru, la Tasmanie — 12 jours / 11 nuits.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Australie",
        title: "La baie, le roc, l’île",
        duration: "12 jours / 11 nuits",
        season: "Sydney en septembre-novembre et en mars-mai.",
        lede: "Trois vols intérieurs, trois maisons.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "Sydney",
            text: "Accueil à l’aéroport.",
            stay: "Park Hyatt Sydney",
          },
          {
            when: "Jours 5 à 7",
            title: "Uluru",
            text: "Vol vers le centre.",
            stay: "Longitude 131°",
          },
          {
            when: "Jours 8 à 11",
            title: "Tasmanie",
            text: "Vol vers Hobart, route vers Freycinet.",
            stay: "Saffire Freycinet",
          },
          {
            when: "Jour 12",
            title: "Le départ",
            text: "Retour vers une correspondance internationale.",
            stay: "Vols intérieurs tenus",
          },
        ],
        houses: [
          { name: "Park Hyatt Sydney", where: "Sydney", note: "Sous l’Opéra." },
          { name: "Longitude 131°", where: "Uluru", note: "Les dunes face au roc." },
          { name: "Saffire Freycinet", where: "Tasmanie", note: "La côte." },
        ],
        experiences: [
          "Bateau sur la baie",
          "Table demandée à Bennelong",
          "Uluru au lever, avec un guide, sans ascension",
          "Wineglass Bay à pied",
        ],
      },
    ],
  },
  {
    slug: "nouvelle-zelande",
    name: "Nouvelle-Zélande",
    region: "pacifique",
    image: "photo-1469474968028-56623f02e42e",
    alt: "Lumière à travers",
    line: "Auckland, le lac Taupo, le lac Wakatipu.",
    essay:
      "Auckland, le lac Taupo, le lac Wakatipu — 12 jours / 11 nuits.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Nouvelle-Zélande",
        title: "Deux îles, trois lodges",
        duration: "12 jours / 11 nuits",
        season: "Décembre à mars pour l’été austral.",
        lede: "Auckland n’est qu’une nuit.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Auckland",
            text: "Accueil à l’aéroport.",
            stay: "The Hotel Britomart",
          },
          {
            when: "Jours 3 à 6",
            title: "Taupo",
            text: "Route ou vol court vers le lodge.",
            stay: "Huka Lodge",
          },
          {
            when: "Jours 7 à 11",
            title: "Glenorchy",
            text: "Vol vers Queenstown.",
            stay: "Blanket Bay",
          },
          {
            when: "Jour 12",
            title: "Le départ",
            text: "Retour vers une correspondance.",
            stay: "Vols intérieurs",
          },
        ],
        houses: [
          { name: "The Hotel Britomart", where: "Auckland", note: "Le port." },
          { name: "Huka Lodge", where: "Taupo", note: "La rivière, au nord." },
          { name: "Blanket Bay", where: "Glenorchy", note: "Le lac Wakatipu." },
        ],
        experiences: [
          "Accueil à Auckland",
          "Journées au bord de l’eau",
          "Hélicoptère vers Milford si le temps ouvre",
          "Vol entre les deux îles",
        ],
      },
    ],
  },
  {
    slug: "ile-de-paques",
    name: "Île de Pâques",
    region: "pacifique",
    image: "photo-1518548419970-58e3b4079ab2",
    alt: "Pierre et végétation",
    line: "Explora Rapa Nui, et le temps des ahu.",
    essay:
      "Explora Rapa Nui, et le temps des ahu — 5 jours / 4 nuits.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Île de Pâques",
        title: "Les ahu, aux heures justes",
        duration: "5 jours / 4 nuits",
        season: "Octobre à avril, été austral.",
        lede: "Un seul lodge.",
        steps: [
          {
            when: "Jour 1",
            title: "L’arrivée",
            text: "Le vol depuis Santiago est long.",
            stay: "Explora Rapa Nui",
          },
          {
            when: "Jours 2 et 3",
            title: "Les ahu",
            text: "Tongariki à l’aube.",
            stay: "Explora Rapa Nui",
          },
          {
            when: "Jour 4",
            title: "Anakena",
            text: "La plage, un ahu.",
            stay: "Explora Rapa Nui",
          },
          {
            when: "Jour 5",
            title: "Le retour",
            text: "Vol vers Santiago.",
            stay: "La correspondance est tenue",
          },
        ],
        houses: [
          { name: "Explora Rapa Nui", where: "Île de Pâques", note: "Le lodge." },
          { name: "Nayara Hangaroa", where: "Hanga Roa", note: "L’autre adresse." },
        ],
        experiences: [
          "Tongariki à l’aube",
          "Rano Raraku avant les groupes",
          "Guide sur toute l’île",
          "Vol depuis Santiago, tenu",
        ],
      },
    ],
  },
  {
    slug: "hawaii",
    name: "Hawaï",
    region: "pacifique",
    image: "photo-1510414842594-a61c69b5ae57",
    alt: "Côte volcanique et mer",
    line: "Oahu, la Grande Île, Maui.",
    essay:
      "Oahu, la Grande Île, Maui — 10 jours / 9 nuits.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Hawaï",
        title: "Trois îles, trois eaux",
        duration: "10 jours / 9 nuits",
        season: "Avril à juin, et septembre à novembre.",
        lede: "Chaque île a son accueil.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Oahu",
            text: "Accueil à Honolulu.",
            stay: "Halekulani",
          },
          {
            when: "Jours 4 à 7",
            title: "Grande Île",
            text: "Vol vers Kona.",
            stay: "Four Seasons Resort Hualalai",
          },
          {
            when: "Jours 8 et 9",
            title: "Maui",
            text: "La route de Hana avec un chauffeur.",
            stay: "Four Seasons Resort Maui at Wailea",
          },
          {
            when: "Jour 10",
            title: "Le départ",
            text: "Vol vers Honolulu si la correspondance l’exige.",
            stay: "Vols inter-îles tenus",
          },
        ],
        houses: [
          { name: "Halekulani", where: "Waikiki", note: "Au bord de la ville." },
          { name: "Four Seasons Resort Hualalai", where: "Grande Île", note: "La lave, l’eau claire." },
          { name: "Four Seasons Resort Maui at Wailea", where: "Maui", note: "La côte sud." },
        ],
        experiences: [
          "Accueil sur chaque île",
          "Sortie mantas, sur un bateau autorisé",
          "Route de Hana avec chauffeur",
          "Baleines en saison, depuis Maui",
        ],
      },
    ],
  },
  {
    slug: "saint-barth",
    name: "Saint-Barth",
    region: "caraibes",
    image: "photo-1507525428034-b723cf961d3e",
    alt: "Plage claire",
    line: "Flamands, puis la côte de Toiny.",
    essay:
      "Flamands, puis la côte de Toiny — 7 jours / 6 nuits.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Saint-Barth",
        title: "La plage, puis la côte sauvage",
        duration: "7 jours / 6 nuits",
        season: "Décembre à avril.",
        lede: "On arrive souvent par le petit avion.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Flamands",
            text: "La piste, la voiture.",
            stay: "Cheval Blanc St-Barth Isle de France",
          },
          {
            when: "Jour 3",
            title: "Gustavia",
            text: "Un déjeuner au port.",
            stay: "Cheval Blanc St-Barth Isle de France",
          },
          {
            when: "Jours 4 à 6",
            title: "Toiny",
            text: "L’autre côte.",
            stay: "Hôtel Le Toiny",
          },
          {
            when: "Jour 7",
            title: "Le départ",
            text: "Piste, petit avion, correspondance.",
            stay: "Voiture jusqu’à la piste",
          },
        ],
        houses: [
          { name: "Cheval Blanc St-Barth", where: "Flamands", note: "La plage longue." },
          { name: "Hôtel Le Toiny", where: "Toiny", note: "La côte au vent." },
          { name: "Rosewood Le Guanahani", where: "Grand Cul-de-Sac", note: "Le jardin." },
        ],
        experiences: [
          "Accueil à la piste",
          "Voiture et chauffeur sur l’île",
          "Gustavia, le temps d’un déjeuner",
          "Deux maisons, deux côtes",
        ],
      },
    ],
  },
];
