import type { Destination } from "../types";

export const americas: Destination[] = [
  {
    slug: "argentine",
    name: "Argentine",
    region: "amerique-latine",
    image: "photo-1531761535209-180857e963b9",
    alt: "Aiguilles de granite et glace, lumière rasante",
    line: "Buenos Aires, les vignes de Mendoza, le Perito Moreno.",
    essay:
      "L’Argentine se tient en trois temps : la ville qui veille, la cordillère plantée de vignes, puis le silence blanc du sud. Travel BA écrit le rythme, les vols intérieurs et les maisons, et laisse à chaque lieu son heure.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Argentine",
        title: "Buenos Aires, la vigne, puis la glace",
        duration: "12 jours / 11 nuits",
        season:
          "Octobre à avril pour la Patagonie. Buenos Aires est plus douce de mars à mai et de septembre à novembre. Les vendanges à Mendoza se tiennent en mars.",
        lede:
          "On arrive par la ville, on s’arrête dans les vignes, on finit face au glacier. Rien n’est enchaîné trop vite : chaque maison a le temps de devenir un lieu.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Buenos Aires",
            text: "Accueil à Ezeiza, puis Recoleta. Le guide prend la ville au matin : San Telmo avant les boutiques, le bord du fleuve, une maison de collection. Le soir, la table est à Casa Cavia.",
            stay: "Four Seasons Buenos Aires",
          },
          {
            when: "Jours 4 à 6",
            title: "Mendoza",
            text: "Vol vers les Andes. Les caves se visitent à deux ou à quatre, pas en car. Une journée reste libre dans les vignes, sans programme affiché.",
            stay: "Cavas Wine Lodge",
          },
          {
            when: "Jours 7 à 11",
            title: "El Calafate",
            text: "Le Perito Moreno se voit d’abord de loin, puis de près, avec un guide de glace le jour où la marche est ouverte. Le reste du temps, l’estancia et le ciel.",
            stay: "EOLO",
          },
          {
            when: "Jour 12",
            title: "Le retour",
            text: "Vol vers Buenos Aires, accueil au départ. Les correspondances sont écrites avant le jour même.",
            stay: "La maison tient le dernier kilomètre",
          },
        ],
        houses: [
          { name: "Four Seasons Buenos Aires", where: "Recoleta", note: "La ville, tenue depuis un jardin." },
          { name: "Cavas Wine Lodge", where: "Luján de Cuyo", note: "Les vignes sous la cordillère." },
          { name: "EOLO", where: "El Calafate", note: "La steppe, le vent, le glacier au loin." },
        ],
        experiences: [
          "Guide privé à Buenos Aires, aux heures calmes",
          "Caves de Mendoza en petit comité",
          "Marche guidée sur le Perito Moreno, le jour où elle s’ouvre",
          "Accueil à l’arrivée et au départ, vols intérieurs tenus",
        ],
      },
    ],
  },
  {
    slug: "colombie",
    name: "Colombie",
    region: "amerique-latine",
    image: "photo-1555881400-74d7acaacd8b",
    alt: "Façades colorées et balcons, lumière de fin de jour",
    line: "Bogotá, l’axe du café, Cartagena.",
    essay:
      "La Colombie n’est pas une seule côte. Elle est une capitale fraîche, une montagne de café, puis une ville close sur la mer. Travel BA garde ces trois climats dans un même carnet.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Colombie",
        title: "La capitale, le café, la ville close",
        duration: "10 jours / 9 nuits",
        season:
          "Décembre à mars sur la côte, plus sec. Bogotá et Medellín se tiennent toute l’année. L’axe du café est vert en toute saison ; les chemins sont plus sûrs hors des grandes pluies.",
        lede:
          "On commence haut, on descend vers les fincas, on finit dans les remparts. Le voyage est fait de courtes étapes, pas d’une traversée.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Bogotá",
            text: "Accueil à El Dorado. Le musée de l’Or et Botero se prennent le matin. La ville se lit avec un guide, quartier par quartier, sans courir la montagne le jour de l’arrivée.",
            stay: "Four Seasons Hotel Casa Medina",
          },
          {
            when: "Jours 3 à 5",
            title: "L’axe du café",
            text: "Vol vers l’Arménie ou Pereira. La vallée de Cocora se marche tôt. Le reste appartient à la finca : le café, les chevaux, le soir qui tombe vite.",
            stay: "Hacienda Bambusa",
          },
          {
            when: "Jours 6 à 9",
            title: "Cartagena",
            text: "Les remparts à l’ouverture, les îles du Rosaire en bateau privé, un après-midi sans sortie. La maison coloniale fait le calme que la rue ne fait pas.",
            stay: "Casa San Agustín",
          },
          {
            when: "Jour 10",
            title: "Le départ",
            text: "Transfert vers l’aéroport, accueil au départ. Les vols intérieurs restent dans le carnet, avec leurs heures locales.",
            stay: "Transfert tenu par la maison",
          },
        ],
        houses: [
          { name: "Four Seasons Hotel Casa Medina", where: "Bogotá", note: "Une maison espagnole au milieu de la capitale." },
          { name: "Hacienda Bambusa", where: "Quindío", note: "Le café, les jardins, la vallée." },
          { name: "Casa San Agustín", where: "Cartagena", note: "Trois maisons coloniales dans la ville close." },
        ],
        experiences: [
          "Bogotá avec un guide, le matin",
          "Vallée de Cocora avant les groupes",
          "Bateau privé vers les îles du Rosaire",
          "Accueil à Bogotá et à Cartagena",
        ],
      },
    ],
  },
  {
    slug: "bresil",
    name: "Brésil",
    region: "amerique-latine",
    image: "photo-1483729558449-99ef09a8c325",
    alt: "Baie, pitons et mer, vus de haut",
    line: "Rio, les chutes d’Iguaçu, Trancoso.",
    essay:
      "Le Brésil de la maison n’essaie pas de tout voir. Rio pour la baie, Iguaçu pour l’eau, Trancoso pour disparaître. Trois avions, trois manières de se lever.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Brésil",
        title: "La baie, les chutes, le quadrado",
        duration: "11 jours / 10 nuits",
        season:
          "Rio de mai à octobre, moins de pluie. Iguaçu se visite toute l’année ; le débit est plus fort pendant les pluies. Trancoso est à son plus beau de décembre à mars.",
        lede:
          "La ville d’abord, le bruit de l’eau ensuite, puis un village de sable. Le carnet suit cet ordre, et les journées restent larges.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "Rio",
            text: "Accueil à Galeão. Le Pain de Sucre et Santa Teresa se prennent tôt. Une table est demandée à Lasai. Une journée reste pour la mer, sans monument.",
            stay: "Belmond Copacabana Palace",
          },
          {
            when: "Jours 5 et 6",
            title: "Iguaçu",
            text: "L’hôtel est dans le parc. Les passerelles brésiliennes s’ouvrent avec vous, avant la chaleur. Le soir, le bruit des chutes remplace la ville.",
            stay: "Belmond Hotel das Cataratas",
          },
          {
            when: "Jours 7 à 10",
            title: "Trancoso",
            text: "Vol vers Porto Seguro, puis la route. Le quadrado le soir, la plage le matin, un bateau si la mer est claire. Rien d’autre n’est inscrit.",
            stay: "UXUA Casa",
          },
          {
            when: "Jour 11",
            title: "Le retour",
            text: "La route inverse est déjà écrite, avec le temps de ne pas la courir.",
            stay: "Transferts et vols tenus",
          },
        ],
        houses: [
          { name: "Belmond Copacabana Palace", where: "Rio de Janeiro", note: "La baie, depuis la courbe de la plage." },
          { name: "Belmond Hotel das Cataratas", where: "Iguaçu", note: "Dormir dans le parc, contre les chutes." },
          { name: "UXUA Casa", where: "Trancoso", note: "Maisons basses, autour du quadrado." },
        ],
        experiences: [
          "Rio au matin, avec un guide",
          "Les chutes à l’ouverture du parc",
          "Table demandée à Lasai",
          "Bateau au départ de Trancoso, si la mer le permet",
        ],
      },
    ],
  },
  {
    slug: "mexique",
    name: "Mexique",
    region: "amerique-latine",
    image: "photo-1518638150340-f706e86654de",
    alt: "Pierre claire et végétation, lumière franche",
    line: "Mexico, la côte de Puerto Escondido, la lagune de Mayakoba.",
    essay:
      "Le Mexique que l’on écrit commence dans la capitale, passe par une côte encore tenue, et s’achève dans une lagune. Trois tables, trois eaux, un seul conseiller.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Mexique",
        title: "La capitale, puis deux mers",
        duration: "10 jours / 9 nuits",
        season: "Novembre à avril, saison sèche sur les côtes. Mexico est plus fraîche, et belle, de la même fenêtre.",
        lede: "On ne traverse pas le pays. On choisit trois maisons, et l’on reste assez pour que la ville, puis la mer, existent vraiment.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Mexico",
            text: "Accueil à l’aéroport. Teotihuacán à l’ouverture, le musée d’anthropologie avec un guide, une table demandée chez Pujol. L’altitude dicte le premier soir : il reste calme.",
            stay: "Four Seasons Mexico City",
          },
          {
            when: "Jours 4 à 6",
            title: "Puerto Escondido",
            text: "La côte du Pacifique, les piscines, le bruit du ressac. Une sortie en mer si l’eau est bonne. Le programme s’arrête là.",
            stay: "Hotel Escondido",
          },
          {
            when: "Jours 7 à 9",
            title: "Riviera Maya",
            text: "Vol vers Cancún, accueil, lagune. Un bateau privé dans les canaux, un cenote choisi pour l’heure, pas pour la file.",
            stay: "Rosewood Mayakoba",
          },
          {
            when: "Jour 10",
            title: "Le départ",
            text: "Accueil au départ de Cancún. Les trois vols du voyage sont déjà dans le carnet.",
            stay: "Transfert du dernier matin",
          },
        ],
        houses: [
          { name: "Four Seasons Mexico City", where: "Reforma", note: "La capitale, avec un jardin au milieu." },
          { name: "Hotel Escondido", where: "Puerto Escondido", note: "Pavillons, piscines, Pacifique." },
          { name: "Rosewood Mayakoba", where: "Riviera Maya", note: "La lagune plutôt que la route des hôtels." },
        ],
        experiences: [
          "Teotihuacán à l’ouverture",
          "Table demandée chez Pujol",
          "Bateau privé dans la lagune de Mayakoba",
          "Accueils à Mexico et à Cancún",
        ],
      },
    ],
  },
  {
    slug: "panama",
    name: "Panama",
    region: "amerique-latine",
    image: "photo-1552733407-5d5c46c3bb3b",
    alt: "Côte tropicale et eau claire",
    line: "Le Casco, puis l’archipel d’Islas Secas.",
    essay:
      "Panama est une ville de bois et de pierre, puis un archipel où l’on n’arrive qu’en petit nombre. Travel BA tient les deux, et le passage de l’un à l’autre.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Panama",
        title: "La ville, puis les îles",
        duration: "8 jours / 7 nuits",
        season: "Décembre à avril, saison sèche. La mer est plus lisible, la ville aussi.",
        lede: "Trois nuits pour comprendre le Casco et le canal. Quatre nuits pour ne plus voir que l’eau.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Le Casco",
            text: "Accueil à Tocumen. Le quartier à pied, les balcons, un bateau sur la baie si le ciel tient. Les soirées restent dans les rues du Casco.",
            stay: "American Trade Hotel",
          },
          {
            when: "Jour 3",
            title: "Le canal",
            text: "Miraflores au matin, avant la chaleur. On regarde une écluse, puis on rentre. Le vol vers l’archipel est le lendemain.",
            stay: "American Trade Hotel",
          },
          {
            when: "Jours 4 à 7",
            title: "Islas Secas",
            text: "Vol léger vers l’archipel. Les bateaux, les sentiers, le silence du soir. Le lodge a peu de maisons : le séjour est écrit pour cela.",
            stay: "Islas Secas",
          },
          {
            when: "Jour 8",
            title: "Le retour",
            text: "Le vol du matin ramène à la ville, puis à la correspondance. L’accueil du départ est déjà prévu.",
            stay: "La maison reprend le fil à Panama",
          },
        ],
        houses: [
          { name: "American Trade Hotel", where: "Casco Viejo", note: "Une ancienne caserne, au cœur du quartier." },
          { name: "Islas Secas", where: "Golfe de Chiriquí", note: "Un archipel privé, quelques casitas." },
        ],
        experiences: [
          "Le canal au matin",
          "Vol léger vers l’archipel",
          "Sorties en bateau depuis le lodge",
          "Accueil à Tocumen",
        ],
      },
    ],
  },
  {
    slug: "costa-rica",
    name: "Costa Rica",
    region: "amerique-latine",
    image: "photo-1518548419970-58e3b4079ab2",
    alt: "Forêt dense et lumière filtrée",
    line: "Papagayo, puis le volcan Arenal.",
    essay:
      "Deux maisons suffisent. L’une sur le golfe, l’autre face au volcan. Entre les deux, un transfert que l’on ne vous demande pas d’inventer.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Costa Rica",
        title: "Le golfe, puis le volcan",
        duration: "9 jours / 8 nuits",
        season: "Décembre à avril, saison sèche sur le Pacifique nord et autour d’Arenal.",
        lede: "Le séjour commence par la mer et finit dans la forêt. Les jours sont longs, les routes sont courtes.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Péninsule de Papagayo",
            text: "Accueil à Liberia. La baie, la forêt sèche au petit matin. Le resort est le point fixe ; les sorties partent de là.",
            stay: "Four Seasons Resort Costa Rica",
          },
          {
            when: "Jour 4",
            title: "Le golfe",
            text: "Un bateau privé, le temps que la mer le permet. L’après-midi revient à la maison. La route vers le volcan est le lendemain.",
            stay: "Four Seasons Resort Costa Rica",
          },
          {
            when: "Jours 5 à 8",
            title: "Arenal",
            text: "Route privée vers le volcan. Sources chaudes, ponts suspendus avec un guide, une journée sans excursion. Les tentes regardent la forêt.",
            stay: "Nayara Tented Camp",
          },
          {
            when: "Jour 9",
            title: "Le départ",
            text: "Retour vers Liberia, accueil au vol. L’heure de route est déjà dans le carnet.",
            stay: "Chauffeur pour la dernière route",
          },
        ],
        houses: [
          { name: "Four Seasons Resort Costa Rica", where: "Papagayo", note: "Le golfe, la forêt sèche, le silence." },
          { name: "Nayara Tented Camp", where: "Arenal", note: "Toiles tendues, sources chaudes, volcan." },
        ],
        experiences: [
          "Bateau sur le golfe",
          "Ponts et forêt avec un guide privé",
          "Sources chaudes au lodge",
          "Routes en voiture privée",
        ],
      },
    ],
  },
  {
    slug: "perou",
    name: "Pérou",
    region: "amerique-latine",
    image: "photo-1526392060635-9d6019884377",
    alt: "Crête andine et ruines dans la brume",
    line: "Lima, la vallée sacrée, le Machu Picchu.",
    essay:
      "Le Pérou se monte lentement. Lima d’abord, pour l’altitude zéro et la table. Puis la vallée, puis Cuzco, puis une nuit à la porte du site. Travel BA écrit ces paliers pour que le corps suive.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Pérou",
        title: "La côte, la vallée, la citadelle",
        duration: "10 jours / 9 nuits",
        season:
          "Mai à septembre, saison sèche sur les Andes. Lima reste sous la brume une partie de l’année ; la table, elle, ne dépend pas du soleil.",
        lede: "On ne monte pas au Machu Picchu le lendemain de l’avion. Le séjour donne à la vallée le temps de vous habituer à l’air.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Lima",
            text: "Accueil à l’aéroport. Miraflores, une table demandée chez Central ou Kjolle, un matin dans la ville avec un guide. Le premier soir reste bas.",
            stay: "Belmond Miraflores Park",
          },
          {
            when: "Jours 3 à 5",
            title: "Vallée sacrée",
            text: "Vol vers Cuzco, descente immédiate dans la vallée. Salines, terrasses et villages avec un guide, aux heures où les routes sont encore vides.",
            stay: "Explora Valle Sagrado",
          },
          {
            when: "Jours 6 et 7",
            title: "Cuzco",
            text: "La ville à présent que l’altitude est connue. Places, pierres, une après-midi libre. Le train du lendemain est déjà tenu.",
            stay: "Belmond Palacio Nazarenas",
          },
          {
            when: "Jours 8 et 9",
            title: "Machu Picchu",
            text: "Train du matin. Le site à l’ouverture, avec un guide. La nuit se passe à la porte, pour y retourner si le ciel du premier jour n’a pas suffi.",
            stay: "Belmond Sanctuary Lodge",
          },
          {
            when: "Jour 10",
            title: "Le retour",
            text: "Descente, vol, accueil au départ de Lima.",
            stay: "Correspondances écrites",
          },
        ],
        houses: [
          { name: "Belmond Miraflores Park", where: "Lima", note: "La falaise au-dessus du Pacifique." },
          { name: "Explora Valle Sagrado", where: "Vallée sacrée", note: "Le palier juste, avant Cuzco." },
          { name: "Belmond Palacio Nazarenas", where: "Cuzco", note: "Un couvent, au calme de la ville." },
          { name: "Belmond Sanctuary Lodge", where: "Machu Picchu", note: "La seule maison à la porte du site." },
        ],
        experiences: [
          "Table demandée à Lima",
          "Vallée avec un guide privé",
          "Train du matin vers le site",
          "Machu Picchu à l’ouverture",
        ],
      },
    ],
  },
  {
    slug: "chili",
    name: "Chili",
    region: "amerique-latine",
    image: "photo-1474044159687-1ee9f3a51722",
    alt: "Dunes et ciel immense",
    line: "Santiago, une vigne, l’Atacama, la Patagonie.",
    essay:
      "Le Chili est un pays vertical. La maison le lit du nord au sud : la capitale, une bodega, le désert le plus sec, puis les tours de granit. Quatre maisons, un seul fil.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Chili",
        title: "Du vignoble aux tours",
        duration: "12 jours / 11 nuits",
        season:
          "Atacama de mars à mai et de septembre à novembre. Patagonie d’octobre à avril. Santiago se tient toute l’année.",
        lede: "On ne cherche pas à relier ces climats par la route. Les vols font le pays ; les lodges font le reste.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Santiago",
            text: "Accueil à l’aéroport. Lastarria, un musée, une table. La ville sert de seuil, pas de checklist.",
            stay: "The Singular Santiago",
          },
          {
            when: "Jours 3 et 4",
            title: "Millahue",
            text: "La vallée, le bâtiment de la bodega, les vignes en pente. La dégustation est privée. Une journée reste sans visite.",
            stay: "Vik Chile",
          },
          {
            when: "Jours 5 à 7",
            title: "Atacama",
            text: "Vol vers Calama. Geysers ou lagunes selon l’heure juste, avec un guide du lodge. Le ciel du désert fait la soirée.",
            stay: "Tierra Atacama",
          },
          {
            when: "Jours 8 à 11",
            title: "Torres del Paine",
            text: "Vol vers Punta Arenas, transfert. Les tours, un lac, une marche choisie pour le vent du jour. Pas de sentier imposé.",
            stay: "Tierra Patagonia",
          },
          {
            when: "Jour 12",
            title: "Le retour",
            text: "La remontée vers Santiago est tenue, avec une marge pour le vent de Patagonie.",
            stay: "Vols et accueils écrits",
          },
        ],
        houses: [
          { name: "The Singular Santiago", where: "Santiago", note: "Une gare devenue maison, au Lastarria." },
          { name: "Vik Chile", where: "Millahue", note: "La vigne comme un séjour, pas comme une halte." },
          { name: "Tierra Atacama", where: "San Pedro", note: "Le désert, depuis les pierreuses." },
          { name: "Tierra Patagonia", where: "Torres del Paine", note: "Le vent, le lac, les tours." },
        ],
        experiences: [
          "Dégustation privée dans la vallée",
          "Atacama avec les guides du lodge",
          "Marche dans le parc selon le vent",
          "Vols intérieurs et marges pour la Patagonie",
        ],
      },
    ],
  },
  {
    slug: "canada",
    name: "Canada",
    region: "amerique-nord",
    image: "photo-1506905925346-21bda4d32df4",
    alt: "Lac de montagne et forêt de mélèzes",
    line: "Vancouver, une lodge en hydravion, le lac Louise.",
    essay:
      "L’ouest canadien, en saison claire : la ville sur l’eau, une forêt où l’on n’arrive qu’en hydravion, puis les lacs des Rocheuses avant la foule du milieu de journée.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Canada",
        title: "L’eau, la forêt, les lacs",
        duration: "10 jours / 9 nuits",
        season:
          "Juin à septembre pour les lacs et les hydravions. Septembre ajoute les mélèzes. L’hiver des Rocheuses appartient à la page ski.",
        lede: "Le séjour est une descente de l’ouest vers les montagnes, avec un seul saut en avion léger.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Vancouver",
            text: "Accueil à l’aéroport. Stanley Park au matin, une table demandée, le port. La ville prépare le silence d’après.",
            stay: "Fairmont Pacific Rim",
          },
          {
            when: "Jours 3 à 5",
            title: "Clayoquot",
            text: "Hydravion vers la lodge. Forêt primaire, kayak si l’eau est plate, les repas au bord de l’anse. Pas de route.",
            stay: "Clayoquot Wilderness Lodge",
          },
          {
            when: "Jours 6 à 9",
            title: "Lac Louise",
            text: "Vol vers Calgary, voiture privée vers la vallée. Louise et Moraine à l’ouverture, avec un guide. Les après-midi restent au lodge.",
            stay: "Post Hotel & Spa",
          },
          {
            when: "Jour 10",
            title: "Le départ",
            text: "Route vers Calgary, accueil au vol international.",
            stay: "Chauffeur des Rocheuses",
          },
        ],
        houses: [
          { name: "Fairmont Pacific Rim", where: "Vancouver", note: "Le port, au pied des tours de verre." },
          { name: "Clayoquot Wilderness Lodge", where: "Île de Vancouver", note: "On n’y arrive qu’en hydravion." },
          { name: "Post Hotel & Spa", where: "Lac Louise", note: "Une maison de bois au bord de la rivière." },
        ],
        experiences: [
          "Hydravion vers la forêt",
          "Lacs Louise et Moraine à l’ouverture",
          "Table à Vancouver, demandée par la maison",
          "Voiture privée dans les Rocheuses",
        ],
      },
    ],
  },
  {
    slug: "californie",
    name: "Californie",
    region: "amerique-nord",
    image: "photo-1507525428034-b723cf961d3e",
    alt: "Sable, eau turquoise et ciel ouvert",
    line: "San Francisco, Napa, Big Sur.",
    essay:
      "Une Californie courte et précise : la baie, la vigne, la falaise. Pas de route infinie. Trois maisons, et la Highway 1 seulement là où elle est belle.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Californie",
        title: "La baie, la vigne, la falaise",
        duration: "9 jours / 8 nuits",
        season: "Avril à juin, et septembre à octobre. Les vendanges de septembre changent Napa. Big Sur est plus net en automne.",
        lede: "Le chauffeur connaît la côte. Vous n’avez pas à la conduire.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "San Francisco",
            text: "Accueil à l’aéroport. La ville à pied là où elle se marche, un musée, le soir sur la baie. Le brouillard fait partie du séjour, pas un contretemps.",
            stay: "Four Seasons Hotel San Francisco",
          },
          {
            when: "Jours 3 à 5",
            title: "Napa",
            text: "Route privée vers la vallée. Deux caves, pas dix. Une table de Yountville est demandée longtemps à l’avance, et n’est inscrite que si elle se confirme.",
            stay: "Auberge du Soleil",
          },
          {
            when: "Jours 6 à 8",
            title: "Big Sur",
            text: "La côte, lentement. Le lodge est sur la falaise. Les jours n’ont pas d’excursion : la mer, le sentier du matin, le silence.",
            stay: "Post Ranch Inn",
          },
          {
            when: "Jour 9",
            title: "Le départ",
            text: "Vers San Francisco ou Los Angeles, selon le vol. La route est calculée avec de la marge.",
            stay: "Chauffeur jusqu’à l’avion",
          },
        ],
        houses: [
          { name: "Four Seasons Hotel San Francisco", where: "San Francisco", note: "La ville, au-dessus de la baie." },
          { name: "Auberge du Soleil", where: "Napa", note: "Les oliviers et la vallée." },
          { name: "Post Ranch Inn", where: "Big Sur", note: "La falaise, et rien d’autre." },
        ],
        experiences: [
          "Caves en privé, deux au plus",
          "Table de Yountville si elle se confirme",
          "Highway 1 avec chauffeur",
          "Accueil à San Francisco",
        ],
      },
    ],
  },
  {
    slug: "cote-ouest",
    name: "Côte Ouest",
    region: "amerique-nord",
    image: "photo-1469854523086-cc02fe5d8800",
    alt: "Route ouverte vers des collines",
    line: "Seattle, la côte de l’Oregon, Santa Barbara.",
    essay:
      "La Côte Ouest, ici, n’est pas un second voyage en Californie. Elle part de Seattle, longe l’Oregon, et s’arrête à Santa Barbara. La route est le sujet. Le chauffeur la tient.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Côte Ouest",
        title: "Du détroit à la plage blanche",
        duration: "11 jours / 10 nuits",
        season: "Juin à septembre pour la côte. Septembre est souvent le plus clair, du nord au sud.",
        lede: "Trois escales longues, plutôt qu’une route qui ne dort pas.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Seattle",
            text: "Accueil à l’aéroport. Le marché au matin, une table demandée chez Canlis, un bateau sur le détroit si le temps ouvre. La ville sert de port.",
            stay: "Four Seasons Hotel Seattle",
          },
          {
            when: "Jours 4 à 6",
            title: "Oregon",
            text: "Vol court ou route, selon le jour. La côte de Pacific City, les dunes, les soirs au lodge. Pas de ville au programme.",
            stay: "Headlands Coastal Lodge & Spa",
          },
          {
            when: "Jours 7 à 10",
            title: "Santa Barbara",
            text: "Vol vers la Californie du sud. La plage, Montecito, une journée sans mouvement. Los Angeles n’est là que si le vol de retour l’exige.",
            stay: "Rosewood Miramar Beach",
          },
          {
            when: "Jour 11",
            title: "Le départ",
            text: "Accueil à l’aéroport de départ, l’heure de route déjà écrite.",
            stay: "Chauffeur du dernier matin",
          },
        ],
        houses: [
          { name: "Four Seasons Hotel Seattle", where: "Seattle", note: "La ville sur le détroit." },
          { name: "Headlands Coastal Lodge & Spa", where: "Pacific City", note: "La côte de l’Oregon, face aux dunes." },
          { name: "Rosewood Miramar Beach", where: "Montecito", note: "La plage, au sud." },
        ],
        experiences: [
          "Bateau sur le Puget Sound",
          "Table demandée à Seattle",
          "La côte avec chauffeur, par étapes",
          "Journées libres à Montecito",
        ],
      },
    ],
  },
  {
    slug: "miami",
    name: "Miami",
    region: "amerique-nord",
    image: "photo-1573843981267-be1999ff37cd",
    alt: "Eau turquoise et ponton de bois",
    line: "Miami Beach, puis le Surf Club.",
    essay:
      "Miami peut être une ville bruyante. Le séjour que l’on écrit ne l’est pas : deux maisons, la baie en bateau, une table, et des journées qui ne courent pas les quartiers.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Miami",
        title: "Deux maisons face à l’eau",
        duration: "6 jours / 5 nuits",
        season: "Novembre à avril. L’été est chaud, humide, et la maison le dit avant de l’écrire.",
        lede: "Un court séjour, tenu comme un long week-end, avec l’accueil à l’aéroport et la voiture déjà là.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Miami Beach",
            text: "Accueil à Miami. La plage le matin, le Design District si vous le demandez. Le soir reste à l’hôtel.",
            stay: "The Setai",
          },
          {
            when: "Jour 3",
            title: "La baie",
            text: "Un bateau privé en fin de jour. On rentre avant la nuit. Le lendemain, la maison change de quelques minutes vers le nord.",
            stay: "The Setai",
          },
          {
            when: "Jours 4 et 5",
            title: "Surfside",
            text: "Quelques minutes plus au nord, une autre maison, un autre silence. La table du Surf Club se demande. Une journée peut ne rien avoir d’inscrit.",
            stay: "Four Seasons at The Surf Club",
          },
          {
            when: "Jour 6",
            title: "Le départ",
            text: "Voiture vers l’aéroport, accueil au départ.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "The Setai", where: "Miami Beach", note: "La plage, les tours basses, le calme intérieur." },
          { name: "Four Seasons at The Surf Club", where: "Surfside", note: "L’ancienne maison balnéaire, reprise." },
        ],
        experiences: [
          "Bateau privé sur la baie",
          "Table du Surf Club, si elle se confirme",
          "Chauffeur pour les quelques trajets",
          "Accueil à l’arrivée",
        ],
      },
    ],
  },
  {
    slug: "cuba",
    name: "Cuba",
    region: "caraibes",
    image: "photo-1555881400-74d7acaacd8b",
    alt: "Rue colorée et balcons",
    line: "La Havane, Viñales, Trinidad.",
    essay:
      "Cuba se tient autrement. Les palaces y sont rares, et la maison ne fait pas semblant. Elle choisit les quelques adresses qui ont un vrai niveau, et elle reste près de vous pour le reste : les heures, les routes, les tables.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Cuba",
        title: "La Havane, la vallée, la ville coloniale",
        duration: "8 jours / 7 nuits",
        season: "Novembre à avril. L’été est lourd, et les ouragans appartiennent à la fenêtre de juin à novembre.",
        lede: "Le séjour suit trois lieux, en voiture privée, avec un guide. Les journées commencent tôt, quand les rues sont encore à vous.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "La Havane",
            text: "Accueil à l’aéroport. Le Malecón au matin, une maison d’Hemingway avant les cars, le soir à La Guarida si la table se confirme. Une voiture ancienne peut faire une heure, pas la journée.",
            stay: "Gran Hotel Manzana Kempinski",
          },
          {
            when: "Jour 5",
            title: "Viñales",
            text: "Route vers l’ouest. Les mogotes, le tabac, une nuit face à la vallée. La maison est simple : on vient pour le paysage, et l’on repart.",
            stay: "Los Jazmines",
          },
          {
            when: "Jours 6 et 7",
            title: "Trinidad",
            text: "La ville coloniale à pied, avec le guide, aux heures fraîches. La plaza le soir. La route du retour vers La Havane est déjà prévue.",
            stay: "Iberostar Grand Hotel Trinidad",
          },
          {
            when: "Jour 8",
            title: "Le départ",
            text: "Retour à La Havane, accueil au vol. Les marges de route sont larges.",
            stay: "Voiture privée",
          },
        ],
        houses: [
          { name: "Gran Hotel Manzana Kempinski", where: "La Havane", note: "Le meilleur seuil de la ville, sur le Parque Central." },
          { name: "Los Jazmines", where: "Viñales", note: "La vue sur les mogotes, pour une nuit." },
          { name: "Iberostar Grand Hotel Trinidad", where: "Trinidad", note: "Dans le tissu colonial de la ville." },
        ],
        experiences: [
          "Guide privé sur toute la route",
          "La Havane aux heures calmes",
          "Table à La Guarida si elle se confirme",
          "Voiture privée entre les trois lieux",
        ],
      },
    ],
  },
  {
    slug: "caraibes",
    name: "Les Caraïbes",
    region: "caraibes",
    image: "photo-1551918120-9739cb430c6d",
    alt: "Lagon pâle et sable blanc",
    line: "Anguilla, Sainte-Lucie, Antigua.",
    essay:
      "Trois îles, trois maisons, des vols courts entre elles. Les Caraïbes, ici, ne sont pas une escale de croisière. Chaque île a assez de nuits pour devenir un lieu.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Les Caraïbes",
        title: "Trois îles, sans escale inutile",
        duration: "10 jours / 9 nuits",
        season: "Décembre à avril. Les ouragans se surveillent de juin à novembre ; la maison ne pose pas un séjour là sans le dire.",
        lede: "Anguilla pour les plages longues, Sainte-Lucie pour les Pitons, Antigua pour finir sur une île plus secrète.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "Anguilla",
            text: "Accueil à l’arrivée, souvent via Sint Maarten. La plage, un bateau vers une crique, les soirs au resort. Quatre nuits, pour ne pas faire que passer.",
            stay: "Four Seasons Anguilla",
          },
          {
            when: "Jours 5 à 7",
            title: "Sainte-Lucie",
            text: "Liaison vers les Pitons. Les suites ouvertes sur la montagne, un bateau le matin, une journée sans sortie.",
            stay: "Jade Mountain",
          },
          {
            when: "Jours 8 et 9",
            title: "Antigua",
            text: "Jumby Bay, le temps de deux nuits très calmes. La mer, les vélos de l’île, le dernier soir.",
            stay: "Jumby Bay Island",
          },
          {
            when: "Jour 10",
            title: "Le retour",
            text: "Vol vers la correspondance internationale. Chaque piste a son accueil.",
            stay: "Liaisons tenues",
          },
        ],
        houses: [
          { name: "Four Seasons Anguilla", where: "Anguilla", note: "Les plages longues de l’ouest." },
          { name: "Jade Mountain", where: "Sainte-Lucie", note: "Les suites ouvertes sur les Pitons." },
          { name: "Jumby Bay Island", where: "Antigua", note: "Une île privée dans l’île." },
        ],
        experiences: [
          "Accueil à chaque piste",
          "Bateau privé depuis Anguilla et Sainte-Lucie",
          "Liaisons entre les îles, en vol privé sur demande",
          "Journées laissées sans programme",
        ],
      },
    ],
  },
];
