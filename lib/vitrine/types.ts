export const REGIONS = [
  { id: "amerique-latine", label: "Amérique latine" },
  { id: "amerique-nord", label: "Amérique du Nord" },
  { id: "caraibes", label: "Caraïbes" },
  { id: "afrique", label: "Afrique" },
  { id: "moyen-orient", label: "Moyen-Orient" },
  { id: "asie", label: "Asie" },
  { id: "pacifique", label: "Pacifique et îles" },
] as const;

export type RegionId = (typeof REGIONS)[number]["id"];

export type Rhythm = "film" | "journal" | "atlas" | "salon";

export type Step = {
  when: string;
  title: string;
  text: string;
  stay: string;
};

export type House = {
  name: string;
  where: string;
  note: string;
};

export type Itinerary = {
  anchor: string;
  name: string;
  title: string;
  duration: string;
  season: string;
  lede: string;
  steps: Step[];
  houses: House[];
  experiences: string[];
};

export type Destination = {
  slug: string;
  name: string;
  region: RegionId;
  image: string;
  alt: string;
  line: string;
  essay: string;
  rhythm: Rhythm;
  itineraries: Itinerary[];
};

export type Layout =
  | "membership"
  | "essay"
  | "family"
  | "occasions"
  | "desk"
  | "salon"
  | "route";

export type Place = {
  name: string;
  where: string;
  text: string;
  image: string;
  alt: string;
  href?: string;
};

export type Universe = {
  slug: string;
  path: string;
  menu: string;
  kicker: string;
  title: string;
  em: string;
  lede: string;
  image: string;
  alt: string;
  essay: string[];
  steps: { n: string; title: string; text: string }[];
  points: { title: string; text: string }[];
  places: Place[];
  app: string;
  layout: Layout;
  wa: string;
};
