import type { Destination } from "../types";

export const orient: Destination[] = [
  {
    slug: "oman",
    name: "Oman",
    region: "moyen-orient",
    image: "photo-1474044159687-1ee9f3a51722",
    alt: "Désert de sable sous un ciel clair",
    line: "Mascate, le Jabal Akhdar, le Musandam.",
    essay:
      "Oman se tient en altitude autant qu’au bord de la mer. La capitale d’abord, la montagne des roses ensuite, les fjords du Musandam pour finir. La chaleur de l’été n’entre pas dans ce carnet.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Oman",
        title: "La ville blanche, la montagne, les fjords",
        duration: "9 jours / 8 nuits",
        season: "Octobre à avril. L’été sur la côte et dans le Musandam n’est pas le moment de ce séjour.",
        lede: "Un chauffeur pour les routes de montagne. Un guide pour Mascate. Le Musandam s’atteint par la piste, et c’est voulu.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Mascate",
            text: "Accueil à l’aéroport. Muttrah tôt, la corniche, l’opéra si la saison et la salle se confirment. Une journée peut rester au bord de la piscine longue.",
            stay: "The Chedi Muscat",
          },
          {
            when: "Jours 4 et 5",
            title: "Jabal Akhdar",
            text: "Route vers le plateau. Terrasses, air frais, roses en avril. Les soirées sont au lodge, au-dessus des villages.",
            stay: "Alila Jabal Akhdar",
          },
          {
            when: "Jours 6 à 8",
            title: "Musandam",
            text: "La piste qui passe la montagne fait partie de l’arrivée, ou le bateau, selon le jour. Les fjords, un dhow, le village en contrebas.",
            stay: "Six Senses Zighy Bay",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Retour vers Mascate, accueil au vol. La marge de route est large.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "The Chedi Muscat", where: "Mascate", note: "La ligne basse face au golfe." },
          { name: "Alila Jabal Akhdar", where: "Jabal Akhdar", note: "Le plateau, à deux mille mètres." },
          { name: "Six Senses Zighy Bay", where: "Musandam", note: "La baie, au bout de la piste." },
        ],
        experiences: [
          "Mascate avec un guide, le matin",
          "Route de montagne avec chauffeur",
          "Dhow dans les fjords",
          "Opéra de Mascate si la salle se confirme",
        ],
      },
    ],
  },
  {
    slug: "dubai",
    name: "Dubaï",
    region: "moyen-orient",
    image: "photo-1512453979798-5ea266f8880c",
    alt: "Tours et ciel du soir",
    line: "La palmeraie, l’île Bulgari, le désert d’Al Maha.",
    essay:
      "Dubaï, tenu sans la vitrine. Deux nuits dans une maison basse, deux nuits sur une île, une nuit dans la réserve. La ville est là si vous la demandez. Elle n’est pas le sujet.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Dubaï",
        title: "Trois silences autour de la ville",
        duration: "6 jours / 5 nuits",
        season: "Novembre à mars. L’été n’est pas le moment de ce séjour.",
        lede: "Le chauffeur connaît les trois portes. Vous ne traversez pas la ville pour le principe.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "La palmeraie",
            text: "Accueil à l’aéroport. La maison, les jardins, la mer au bout de l’allée. Une table si vous la souhaitez, dans l’hôtel.",
            stay: "One&Only Royal Mirage",
          },
          {
            when: "Jours 3 et 4",
            title: "L’île",
            text: "Quelques minutes en voiture. La marina, la crique, un bateau si la mer est bonne. Le soir peut rester sur place.",
            stay: "Bulgari Resort Dubai",
          },
          {
            when: "Jour 5",
            title: "La réserve",
            text: "Route vers le désert. Oryx, dune, une seule nuit. Le lever suffit. On ne prolonge pas pour remplir.",
            stay: "Al Maha, a Luxury Collection Desert Resort",
          },
          {
            when: "Jour 6",
            title: "Le départ",
            text: "Retour vers l’aéroport, avec la marge du désert.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "One&Only Royal Mirage", where: "Dubaï", note: "Les jardins, plutôt que la tour." },
          { name: "Bulgari Resort Dubai", where: "L’île", note: "La mer, à l’écart." },
          { name: "Al Maha", where: "Réserve désertique", note: "Une nuit, les dunes, les oryx." },
        ],
        experiences: [
          "Accueil à l’aéroport",
          "Chauffeur entre les trois maisons",
          "Une nuit dans la réserve",
          "Bateau depuis l’île, si la mer le permet",
        ],
      },
    ],
  },
  {
    slug: "arabie-saoudite",
    name: "Arabie saoudite",
    region: "moyen-orient",
    image: "photo-1500530855697-b586d89ba3ee",
    alt: "Piste dans un désert ocre",
    line: "Diriyah, AlUla, la mer Rouge.",
    essay:
      "Le séjour suit la pierre. Diriyah pour le seuil, AlUla pour Hegra et les canyons, la mer Rouge pour finir dans le sable qui touche l’eau. Les accès se demandent. La maison les demande.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Arabie saoudite",
        title: "La pierre, le canyon, la mer",
        duration: "9 jours / 8 nuits",
        season: "Novembre à mars. Les nuits d’AlUla sont fraîches, parfois froides. L’été n’est pas écrit ici.",
        lede: "Des vols intérieurs courts, des guides sur place, des journées qui commencent tôt à cause de la lumière.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Diriyah",
            text: "Accueil à Riyad. At-Turaif à l’ouverture, avec un guide. La ville moderne seulement si vous la demandez.",
            stay: "Bab Samhan",
          },
          {
            when: "Jours 3 à 6",
            title: "AlUla",
            text: "Vol vers l’oasis. Hegra le matin, la vieille ville, un canyon à l’heure où l’ombre tient. Les après-midi restent au resort.",
            stay: "Banyan Tree AlUla",
          },
          {
            when: "Jours 7 et 8",
            title: "Mer Rouge",
            text: "Vol vers la côte. Le désert rencontre la mer. Deux nuits, le temps de nager et de se taire.",
            stay: "Six Senses Southern Dunes",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Vol vers la correspondance internationale. Les accès du voyage ont été demandés en amont.",
            stay: "Vols intérieurs tenus",
          },
        ],
        houses: [
          { name: "Bab Samhan", where: "Diriyah", note: "Aux portes du site, à Riyad." },
          { name: "Banyan Tree AlUla", where: "AlUla", note: "Les canyons, à portée de matin." },
          { name: "Six Senses Southern Dunes", where: "Mer Rouge", note: "Le sable et l’eau, ensemble." },
        ],
        experiences: [
          "Hegra avec un guide, le matin",
          "At-Turaif à l’ouverture",
          "Vols intérieurs",
          "Accès demandés avant le départ",
        ],
      },
    ],
  },
  {
    slug: "jordanie",
    name: "Jordanie",
    region: "moyen-orient",
    image: "photo-1568322445389-f64ac2515020",
    alt: "Façade rose sculptée dans la falaise",
    line: "Amman, Pétra, Wadi Rum, la mer Morte.",
    essay:
      "La Jordanie tient dans une semaine si l’on ne la court pas. Une nuit à Amman, Pétra sur deux matins, le désert, puis l’eau salée. Le même chauffeur, le même guide.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Jordanie",
        title: "La porte, le canyon, le sel",
        duration: "8 jours / 7 nuits",
        season: "Mars à mai, et septembre à novembre. L’été dans le Wadi Rum est une fournaise. L’hiver peut être froid la nuit.",
        lede: "Pétra se voit deux fois : à l’ouverture, et encore le lendemain si le premier ciel n’a pas suffi.",
        steps: [
          {
            when: "Jour 1",
            title: "Amman",
            text: "Accueil à l’aéroport. La citadelle si l’heure le permet, sinon seulement la nuit. Le voyage commence vraiment le lendemain.",
            stay: "The St. Regis Amman",
          },
          {
            when: "Jours 2 et 3",
            title: "Pétra",
            text: "Route vers le sud. Le Sîq à l’ouverture, le monastère avec le guide, un second matin si vous le souhaitez. L’après-midi du second jour reste libre.",
            stay: "Mövenpick Resort Petra",
          },
          {
            when: "Jours 4 et 5",
            title: "Wadi Rum",
            text: "Le désert en jeep privée, le camp à la tombée du jour, le ciel. Une nuit ne suffit pas ; le carnet en pose deux.",
            stay: "Memories Aicha Luxury Camp",
          },
          {
            when: "Jours 6 et 7",
            title: "Mer Morte",
            text: "Descente vers le sel. L’eau, le repos, rien d’autre. La route du retour vers Amman est prévue le dernier matin.",
            stay: "Kempinski Hotel Ishtar Dead Sea",
          },
          {
            when: "Jour 8",
            title: "Le départ",
            text: "Amman, accueil au vol.",
            stay: "Le même chauffeur",
          },
        ],
        houses: [
          { name: "The St. Regis Amman", where: "Amman", note: "La nuit d’arrivée." },
          { name: "Mövenpick Resort Petra", where: "Pétra", note: "À la porte du Sîq." },
          { name: "Memories Aicha Luxury Camp", where: "Wadi Rum", note: "Les tentes dans le désert." },
          { name: "Kempinski Hotel Ishtar Dead Sea", where: "Mer Morte", note: "Le sel, et le repos." },
        ],
        experiences: [
          "Pétra à l’ouverture, deux matins si besoin",
          "Jeep privée dans le Wadi Rum",
          "Guide et chauffeur sur toute la route",
          "Accueil à Amman",
        ],
      },
    ],
  },
  {
    slug: "israel",
    name: "Israël",
    region: "moyen-orient",
    image: "photo-1467269204594-9661b134dd2b",
    alt: "Ville claire et toits au soleil",
    line: "Tel-Aviv, Jérusalem, le cratère de Ramon.",
    essay:
      "Trois lieux, et le respect des heures. Tel-Aviv pour la ville blanche, Jérusalem au matin, le Néguev pour finir dans le silence. La maison prépare aussi l’autorisation de voyage, et elle compose les journées avec le shabbat.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Israël",
        title: "La ville blanche, la ville sainte, le cratère",
        duration: "8 jours / 7 nuits",
        season: "Mars à mai, et octobre à novembre. L’été est chaud, surtout dans le Néguev.",
        lede: "Le carnet connaît le calendrier. Un vendredi soir ne se planifie pas comme un mardi.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Tel-Aviv",
            text: "Accueil à l’aéroport. La ville blanche avec un architecte ou un guide, le marché le matin, une table que la maison confirme. La plage si vous la voulez, pas comme une obligation.",
            stay: "The Norman",
          },
          {
            when: "Jours 4 et 5",
            title: "Jérusalem",
            text: "Route courte. La vieille ville à l’ouverture, avec un guide, le musée si le jour s’y prête. Les heures de prière et de fermeture sont écrites avant.",
            stay: "Waldorf Astoria Jerusalem",
          },
          {
            when: "Jours 6 et 7",
            title: "Mitzpe Ramon",
            text: "Le cratère au couchant, le silence, une marche au bord. C’est la respiration du séjour.",
            stay: "Beresheet",
          },
          {
            when: "Jour 8",
            title: "Le départ",
            text: "Route vers l’aéroport, accueil. L’autorisation de voyage a été préparée en amont.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "The Norman", where: "Tel-Aviv", note: "Une maison basse dans la ville blanche." },
          { name: "Waldorf Astoria Jerusalem", where: "Jérusalem", note: "À deux pas de la vieille ville." },
          { name: "Beresheet", where: "Mitzpe Ramon", note: "Au bord du cratère." },
        ],
        experiences: [
          "Ville blanche avec un guide",
          "Jérusalem à l’ouverture",
          "Le cratère au couchant",
          "Autorisation de voyage préparée avec vous",
        ],
      },
    ],
  },
];
