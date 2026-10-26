import type { Destination } from "../types";

export const orient: Destination[] = [
  {
    slug: "oman",
    name: "Oman",
    region: "moyen-orient",
    image: "photo-1474044159687-1ee9f3a51722",
    alt: "Désert de sable",
    line: "Mascate, le Jabal Akhdar, le Musandam.",
    essay:
      "Mascate, le Jabal Akhdar, le Musandam — 9 jours / 8 nuits.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Oman",
        title: "La ville blanche, la montagne, les fjords",
        duration: "9 jours / 8 nuits",
        season: "Octobre à avril.",
        lede: "Un chauffeur pour les routes de montagne.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Mascate",
            text: "Accueil à l’aéroport.",
            stay: "The Chedi Muscat",
          },
          {
            when: "Jours 4 et 5",
            title: "Jabal Akhdar",
            text: "Route vers le plateau.",
            stay: "Alila Jabal Akhdar",
          },
          {
            when: "Jours 6 à 8",
            title: "Musandam",
            text: "La piste passe la montagne.",
            stay: "Six Senses Zighy Bay",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Retour vers Mascate, accueil au vol.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "The Chedi Muscat", where: "Mascate", note: "La ligne basse." },
          { name: "Alila Jabal Akhdar", where: "Jabal Akhdar", note: "Le plateau." },
          { name: "Six Senses Zighy Bay", where: "Musandam", note: "La baie." },
        ],
        experiences: [
          "Mascate avec un guide",
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
    alt: "Tours et ciel",
    line: "La palmeraie, l’île Bulgari, le désert d’Al Maha.",
    essay:
      "La palmeraie, l’île Bulgari, le désert d’Al Maha.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Dubaï",
        title: "Trois silences autour de la ville",
        duration: "6 jours / 5 nuits",
        season: "Novembre à mars.",
        lede: "Le chauffeur connaît les trois portes.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "La palmeraie",
            text: "Accueil à l’aéroport.",
            stay: "One&Only Royal Mirage",
          },
          {
            when: "Jours 3 et 4",
            title: "L’île",
            text: "Quelques minutes en voiture.",
            stay: "Bulgari Resort Dubai",
          },
          {
            when: "Jour 5",
            title: "La réserve",
            text: "Route vers le désert.",
            stay: "Al Maha, a Luxury Collection Desert Resort",
          },
          {
            when: "Jour 6",
            title: "Le départ",
            text: "Retour vers l’aéroport.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "One&Only Royal Mirage", where: "Dubaï", note: "Les jardins." },
          { name: "Bulgari Resort Dubai", where: "L’île", note: "La mer, à l’écart." },
          { name: "Al Maha", where: "Réserve désertique", note: "Une nuit, les dunes." },
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
    alt: "Piste dans le désert",
    line: "Diriyah, AlUla, la mer Rouge.",
    essay:
      "Diriyah, AlUla, la mer Rouge — 9 jours / 8 nuits.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Arabie saoudite",
        title: "La pierre, le canyon, la mer",
        duration: "9 jours / 8 nuits",
        season: "Novembre à mars.",
        lede: "Des vols intérieurs courts.",
        steps: [
          {
            when: "Jours 1 et 2",
            title: "Diriyah",
            text: "Accueil à Riyad.",
            stay: "Bab Samhan",
          },
          {
            when: "Jours 3 à 6",
            title: "AlUla",
            text: "Vol vers l’oasis.",
            stay: "Banyan Tree AlUla",
          },
          {
            when: "Jours 7 et 8",
            title: "Mer Rouge",
            text: "Vol vers la côte.",
            stay: "Six Senses Southern Dunes",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Vol vers la correspondance internationale.",
            stay: "Vols intérieurs tenus",
          },
        ],
        houses: [
          { name: "Bab Samhan", where: "Diriyah", note: "Aux portes du site." },
          { name: "Banyan Tree AlUla", where: "AlUla", note: "Les canyons." },
          { name: "Six Senses Southern Dunes", where: "Mer Rouge", note: "Le sable et l’eau." },
        ],
        experiences: [
          "Hegra avec un guide",
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
    alt: "Façade rose sculptée",
    line: "Amman, Pétra, Wadi Rum, la mer Morte.",
    essay:
      "Amman, Pétra, Wadi Rum, la mer Morte — 8 jours / 7 nuits.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Jordanie",
        title: "La porte, le canyon, le sel",
        duration: "8 jours / 7 nuits",
        season: "Mars à mai, et septembre à novembre.",
        lede: "Pétra se voit deux fois : à l’ouverture.",
        steps: [
          {
            when: "Jour 1",
            title: "Amman",
            text: "Accueil à l’aéroport.",
            stay: "The St. Regis Amman",
          },
          {
            when: "Jours 2 et 3",
            title: "Pétra",
            text: "Route vers le sud.",
            stay: "Mövenpick Resort Petra",
          },
          {
            when: "Jours 4 et 5",
            title: "Wadi Rum",
            text: "Le désert en jeep privée.",
            stay: "Memories Aicha Luxury Camp",
          },
          {
            when: "Jours 6 et 7",
            title: "Mer Morte",
            text: "Descente vers le sel.",
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
          { name: "Kempinski Hotel Ishtar Dead Sea", where: "Mer Morte", note: "Le sel." },
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
    alt: "Ville claire",
    line: "Tel-Aviv, Jérusalem, le cratère de Ramon.",
    essay:
      "Tel-Aviv, Jérusalem, le cratère de Ramon.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Israël",
        title: "La ville blanche, la ville sainte, le cratère",
        duration: "8 jours / 7 nuits",
        season: "Mars à mai, et octobre à novembre.",
        lede: "Le carnet connaît le calendrier.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Tel-Aviv",
            text: "Accueil à l’aéroport.",
            stay: "The Norman",
          },
          {
            when: "Jours 4 et 5",
            title: "Jérusalem",
            text: "Route courte.",
            stay: "Waldorf Astoria Jerusalem",
          },
          {
            when: "Jours 6 et 7",
            title: "Mitzpe Ramon",
            text: "Le cratère au couchant.",
            stay: "Beresheet",
          },
          {
            when: "Jour 8",
            title: "Le départ",
            text: "Route vers l’aéroport, accueil.",
            stay: "Chauffeur",
          },
        ],
        houses: [
          { name: "The Norman", where: "Tel-Aviv", note: "Une maison basse." },
          { name: "Waldorf Astoria Jerusalem", where: "Jérusalem", note: "Près de la vieille ville." },
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
