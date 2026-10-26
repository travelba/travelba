import { siteConfig } from "@/lib/site";

/** Photo Unsplash déjà recadrée. Le composant Image de Next la sert en plusieurs tailles. */
export function unsplash(id: string, width = 2000) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=75`;
}

export const shot = {
  hero: "photo-1571896349842-33c89424de2d",
  suite: "photo-1582719478250-c89cae4dc85b",
  koutoubia: "photo-1489749798305-4fea3ae63d43",
  majorelle: "photo-1597212618440-806262de4f6b",
  medina: "photo-1539020140153-e479b8c22e70",
  lanterns: "photo-1558642452-9d2a7deb7f62",
  amalfi: "photo-1533104816931-20fa691ff6ca",
  maldives: "photo-1514282401047-d79a71a590e8",
  kyoto: "photo-1493976040374-85c8e12f0c0e",
  seychelles: "photo-1540202404-a2f29016b523",
  peaks: "photo-1483921020237-2ff51e8e4b22",
  skier: "photo-1551524559-8af4e6624178",
  slope: "photo-1605540436563-5bca919ae766",
  cabin: "photo-1520769945061-0a448c463865",
  chalet: "photo-1542718610-a1d656d1884c",
  matterhorn: "photo-1464822759023-fed622ff2c3b",
  lake: "photo-1506905925346-21bda4d32df4",
} as const;

export function whatsappHref(text: string) {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

export const waCopy = {
  home: "Bonjour, je souhaite échanger avec Travel BA au sujet d’un voyage.",
  seminaires:
    "Bonjour, je prépare un séminaire ou un événement et je souhaite en parler avec Travel BA.",
  ski: "Bonjour, je cherche une semaine de ski, en chalet ou en palace, et je souhaite en parler avec Travel BA.",
  surMesure: "Bonjour, je souhaite composer un voyage sur-mesure avec Travel BA.",
  espace: "Bonjour, je souhaite accéder à l’espace client Travel BA.",
} as const;
