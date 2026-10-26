import type { Destination } from "../types";

export const islands: Destination[] = [
  {
    slug: "republique-dominicaine",
    name: "République dominicaine",
    region: "caraibes",
    image: "photo-1551918120-9739cb430c6d",
    alt: "Sable blanc et eau claire",
    line: "Amanera, puis Casa de Campo.",
    essay:
      "Deux maisons, deux côtes. Les falaises de Playa Grande d’abord, le domaine de La Romana ensuite. La République dominicaine, tenue sans multiplier les hôtels.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "République dominicaine",
        title: "Les falaises, puis le domaine",
        duration: "7 jours / 6 nuits",
        season: "Décembre à avril. L’été est plus humide, et la maison le dit.",
        lede: "On arrive près de Puerto Plata pour Amanera. On finit à La Romana. Le transfert entre les deux est une route, pas une improvisation.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Playa Grande",
            text: "Accueil à l’aéroport, route vers les falaises. La mer en contrebas, le golf si vous le jouez, des journées qui peuvent n’avoir qu’une piscine.",
            stay: "Amanera",
          },
          {
            when: "Jour 4",
            title: "La falaise",
            text: "Une journée sans sortie. La piscine, la mer en contrebas, le dîner à la maison. Le transfert vers La Romana est le lendemain.",
            stay: "Amanera",
          },
          {
            when: "Jours 5 et 6",
            title: "La Romana",
            text: "Vol ou route vers le sud-est. La marina, Altos de Chavón, une plage du domaine. Deux nuits suffisent après les falaises.",
            stay: "Casa de Campo",
          },
          {
            when: "Jour 7",
            title: "Le départ",
            text: "Vers l’aéroport de Punta Cana ou de La Romana, selon le vol. Accueil au départ.",
            stay: "Transfert tenu",
          },
        ],
        houses: [
          { name: "Amanera", where: "Playa Grande", note: "Les falaises au-dessus des Caraïbes." },
          { name: "Casa de Campo", where: "La Romana", note: "Le domaine, la marina, les plages." },
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
      "Deux lagons, pas dix plages. Le nord-est d’abord, l’est ensuite. L’île Maurice se tient mieux lorsqu’on change de maison une seule fois.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Île Maurice",
        title: "Deux lagons",
        duration: "8 jours / 7 nuits",
        season: "Mai à décembre, et plus précisément mai, juin, septembre et novembre pour l’air clair. La saison des cyclones se dit avant l’été austral.",
        lede: "Accueil à l’aéroport, voiture, lagon. Le programme s’arrête presque là. Le reste se demande.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Belle Mare",
            text: "Accueil à l’aéroport, puis le lagon. Une table, des après-midi sans inscription. La maison est le programme.",
            stay: "One&Only Le Saint Géran",
          },
          {
            when: "Jour 4",
            title: "Les îles du nord",
            text: "Un bateau, si la mer est plate. Sinon la journée reste au lagon. Le changement de maison est le lendemain.",
            stay: "One&Only Le Saint Géran",
          },
          {
            when: "Jours 5 à 7",
            title: "Anahita",
            text: "L’autre côte est. Un autre jardin, un autre matin. Le golf seulement si vous le jouez.",
            stay: "Four Seasons Resort Mauritius at Anahita",
          },
          {
            when: "Jour 8",
            title: "Le départ",
            text: "Voiture vers l’aéroport, accueil. Un hélicoptère au-dessus du lagon se demande, il ne s’impose pas.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "One&Only Le Saint Géran", where: "Belle Mare", note: "Le lagon du nord-est." },
          { name: "Four Seasons Anahita", where: "Côte est", note: "Le second matin, une autre lumière." },
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
    alt: "Rochers de granit dans une eau claire",
    line: "Mahé, puis North Island.",
    essay:
      "Mahé pour atterrir et reprendre son souffle. North Island pour le reste : une île privée, des villas, la conservation comme paysage. L’arrivée se fait souvent en hélicoptère. C’est le chemin, pas un supplément de théâtre.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Seychelles",
        title: "L’île grande, puis l’île privée",
        duration: "9 jours / 8 nuits",
        season: "Avril, mai, octobre et novembre, entre les alizés. Le reste de l’année se dit avec le vent.",
        lede: "Trois nuits pour Mahé. Cinq pour ne plus en partir. Le carnet s’allège en arrivant sur l’île.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Mahé",
            text: "Accueil à l’aéroport. Petite Anse, les rochers, une première baignade. La grande île sert de seuil.",
            stay: "Four Seasons Resort Seychelles",
          },
          {
            when: "Jour 3",
            title: "Le passage",
            text: "Hélicoptère vers North Island, lorsque le temps le permet. La villa est prête. Le carnet s’allège à l’arrivée.",
            stay: "North Island",
          },
          {
            when: "Jours 4 à 8",
            title: "North Island",
            text: "Hélicoptère vers l’île. La villa, les sentiers, la tortue, le bateau autour. Les journées n’ont pas d’autre obligation.",
            stay: "North Island",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Retour vers Mahé, correspondance. L’accueil reprend à l’aéroport.",
            stay: "L’hélicoptère du matin",
          },
        ],
        houses: [
          { name: "Four Seasons Resort Seychelles", where: "Mahé", note: "Petite Anse, les granits." },
          { name: "North Island", where: "North Island", note: "L’île privée, les villas, le temps long." },
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
    alt: "Toits blancs et voiles dans une baie",
    line: "Sydney, Uluru, la Tasmanie.",
    essay:
      "Sydney pour la baie, le désert rouge pour trois nuits justes, la Tasmanie pour finir au bord d’une côte plus froide. L’Australie de ce carnet assume ses vols. Elle ne fait pas semblant que tout est voisin.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Australie",
        title: "La baie, le roc, l’île",
        duration: "12 jours / 11 nuits",
        season:
          "Sydney en septembre-novembre et en mars-mai. Uluru de mai à septembre, quand les journées sont tenables. La Tasmanie est belle aux mêmes saisons fraîches.",
        lede: "Trois vols intérieurs, trois maisons, et le respect d’un site qui ne se gravit pas.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "Sydney",
            text: "Accueil à l’aéroport. La baie à l’aube en petit bateau, l’Opéra, une table demandée à Bennelong. Une journée reste dans les quartiers, sans liste.",
            stay: "Park Hyatt Sydney",
          },
          {
            when: "Jours 5 à 7",
            title: "Uluru",
            text: "Vol vers le centre. Le roc au loin, au lever, avec un guide local. Le champ de lumière au crépuscule. On ne monte pas.",
            stay: "Longitude 131°",
          },
          {
            when: "Jours 8 à 11",
            title: "Tasmanie",
            text: "Vol vers Hobart, route vers Freycinet. Wineglass Bay à pied, avec un guide, une journée de vin et de côte si vous la demandez.",
            stay: "Saffire Freycinet",
          },
          {
            when: "Jour 12",
            title: "Le départ",
            text: "Retour vers une correspondance internationale. Les marges de vol sont réelles.",
            stay: "Vols intérieurs tenus",
          },
        ],
        houses: [
          { name: "Park Hyatt Sydney", where: "Sydney", note: "Sous l’Opéra, sur la baie." },
          { name: "Longitude 131°", where: "Uluru", note: "Les dunes face au roc." },
          { name: "Saffire Freycinet", where: "Tasmanie", note: "La côte, au bout de l’île." },
        ],
        experiences: [
          "Bateau sur la baie, à l’aube",
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
    alt: "Lumière à travers une vallée verte",
    line: "Auckland, le lac Taupo, le lac Wakatipu.",
    essay:
      "Deux îles, trois lodges. Le séjour ne cherche pas à tout relier par la route. Il choisit l’eau chaude, puis le sud, et il laisse l’hélicoptère au temps qu’il fait.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Nouvelle-Zélande",
        title: "Deux îles, trois lodges",
        duration: "12 jours / 11 nuits",
        season: "Décembre à mars pour l’été austral. Novembre et avril sont plus calmes, et souvent plus justes.",
        lede: "Auckland n’est qu’une nuit. Le voyage commence vraiment au bord du Waikato.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Auckland",
            text: "Accueil à l’aéroport. Le port, un dîner, le sommeil. La ville n’a pas à être vaincue.",
            stay: "The Hotel Britomart",
          },
          {
            when: "Jours 3 à 6",
            title: "Taupo",
            text: "Route ou vol court vers le lodge. L’eau, la pêche si vous la pratiquez, les jardins, une journée sans sortie.",
            stay: "Huka Lodge",
          },
          {
            when: "Jours 7 à 11",
            title: "Glenorchy",
            text: "Vol vers Queenstown, route au bord du lac. Les montagnes, un bateau, un hélicoptère vers Milford seulement si le temps ouvre. Sinon, le lac suffit.",
            stay: "Blanket Bay",
          },
          {
            when: "Jour 12",
            title: "Le départ",
            text: "Retour vers une correspondance. Le ciel du sud a toujours une marge dans le carnet.",
            stay: "Vols intérieurs",
          },
        ],
        houses: [
          { name: "The Hotel Britomart", where: "Auckland", note: "Le port, pour la nuit d’arrivée." },
          { name: "Huka Lodge", where: "Taupo", note: "La rivière, au nord." },
          { name: "Blanket Bay", where: "Glenorchy", note: "Le lac Wakatipu, au bout de la route." },
        ],
        experiences: [
          "Accueil à Auckland",
          "Journées au bord de l’eau, sans liste",
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
    alt: "Pierre et végétation sous un ciel large",
    line: "Explora Rapa Nui, et le temps des ahu.",
    essay:
      "L’île n’a pas besoin d’un circuit. Elle a besoin d’heures justes : Tongariki à l’aube, Rano Raraku avant les groupes, Orongo, Anakena. Travel BA tient le vol depuis Santiago et le lodge. Le reste appartient au guide et au vent.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Île de Pâques",
        title: "Les ahu, aux heures justes",
        duration: "5 jours / 4 nuits",
        season: "Octobre à avril, été austral. Les mois de bordure sont souvent plus calmes.",
        lede: "Un seul lodge. Quatre nuits. Le voyage peut se poser à la fin du Chili, ou se tenir seul.",
        steps: [
          {
            when: "Jour 1",
            title: "L’arrivée",
            text: "Le vol depuis Santiago est long. Accueil à l’île, transfert, rien d’autre. Le premier site attend le lendemain.",
            stay: "Explora Rapa Nui",
          },
          {
            when: "Jours 2 et 3",
            title: "Les ahu",
            text: "Tongariki à l’aube, la carrière de Rano Raraku, Orongo. Le guide règle l’ordre selon le vent et la lumière. Une après-midi reste au lodge.",
            stay: "Explora Rapa Nui",
          },
          {
            when: "Jour 4",
            title: "Anakena",
            text: "La plage, un ahu, peut-être le cheval le matin si vous le souhaitez. Le soir est déjà un soir de départ.",
            stay: "Explora Rapa Nui",
          },
          {
            when: "Jour 5",
            title: "Le retour",
            text: "Vol vers Santiago. Si le Chili continue, la maison reprend le fil à l’aéroport.",
            stay: "La correspondance est tenue",
          },
        ],
        houses: [
          { name: "Explora Rapa Nui", where: "Île de Pâques", note: "Le lodge, face au Pacifique." },
          { name: "Nayara Hangaroa", where: "Hanga Roa", note: "L’autre adresse, lorsque le lodge est plein." },
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
      "Trois îles, trois maisons, des vols courts. Honolulu pour arriver sans brutalité, la lave et l’eau claire ensuite, Maui pour finir. Hawaï se tient mieux ainsi qu’en une seule plage.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Hawaï",
        title: "Trois îles, trois eaux",
        duration: "10 jours / 9 nuits",
        season: "Avril à juin, et septembre à novembre. Décembre à mars ajoute les baleines au large de Maui.",
        lede: "Chaque île a son accueil. Les vols inter-îles sont dans le carnet, avec l’heure locale.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Oahu",
            text: "Accueil à Honolulu. La ville avec mesure, un musée, la mer le matin. Waikiki n’a pas à être fui : il se tient depuis la bonne maison.",
            stay: "Halekulani",
          },
          {
            when: "Jours 4 à 7",
            title: "Grande Île",
            text: "Vol vers Kona. Les champs de lave, un snorkel avec les mantas le soir, sur un bateau autorisé, un ranch ou un café si vous le demandez.",
            stay: "Four Seasons Resort Hualalai",
          },
          {
            when: "Jours 8 et 9",
            title: "Maui",
            text: "La route de Hana avec un chauffeur, pas au volant après le décalage. La côte de Wailea. Les baleines en saison, depuis un bateau.",
            stay: "Four Seasons Resort Maui at Wailea",
          },
          {
            when: "Jour 10",
            title: "Le départ",
            text: "Vol vers Honolulu si la correspondance l’exige, accueil au départ international.",
            stay: "Vols inter-îles tenus",
          },
        ],
        houses: [
          { name: "Halekulani", where: "Waikiki", note: "Le calme au bord de la ville." },
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
    alt: "Plage claire et eau turquoise",
    line: "Flamands, puis la côte de Toiny.",
    essay:
      "Saint-Barthélemy en deux maisons. Flamands d’abord, pour la plage longue. Toiny ensuite, pour la côte plus rude. Gustavia tient dans un déjeuner. L’île n’a pas besoin de davantage.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Saint-Barth",
        title: "La plage, puis la côte sauvage",
        duration: "7 jours / 6 nuits",
        season: "Décembre à avril. Le reste de l’année se dit avec les ouragans et la chaleur.",
        lede: "On arrive souvent par le petit avion, depuis Sint Maarten. La maison est à la piste. La voiture est déjà là.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Flamands",
            text: "La piste, la voiture, la plage longue. Les premières nuits sont les plus douces. Rien d’autre n’est inscrit.",
            stay: "Cheval Blanc St-Barth Isle de France",
          },
          {
            when: "Jour 3",
            title: "Gustavia",
            text: "Un déjeuner au port, si vous le souhaitez. L’après-midi revient à Flamands. Le lendemain, la maison change de côte.",
            stay: "Cheval Blanc St-Barth Isle de France",
          },
          {
            when: "Jours 4 à 6",
            title: "Toiny",
            text: "L’autre côte. La piscine au-dessus des rochers, le silence, une table. Rosewood Le Guanahani reste l’adresse lorsque le séjour veut un jardin, ou des enfants.",
            stay: "Hôtel Le Toiny",
          },
          {
            when: "Jour 7",
            title: "Le départ",
            text: "Piste, petit avion, correspondance. L’accueil fait le chemin inverse.",
            stay: "Voiture jusqu’à la piste",
          },
        ],
        houses: [
          { name: "Cheval Blanc St-Barth", where: "Flamands", note: "La plage longue." },
          { name: "Hôtel Le Toiny", where: "Toiny", note: "La côte au vent." },
          { name: "Rosewood Le Guanahani", where: "Grand Cul-de-Sac", note: "Le jardin, lorsque le séjour l’appelle." },
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
