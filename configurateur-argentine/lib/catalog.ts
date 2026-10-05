import seedJson from "../data/seed.json";

export type Tier = "luxe" | "hdg" | "eco";

export type Stage = {
  id: string;
  label: string;
  days: string[];
  nights: number;
  defaultHotel: string;
};

export type Hotel = {
  id: string;
  name: string;
  dest: string;
  url: string;
  tier: Tier;
  usdNightMid: number;
  nightsAt: string[];
  note: string;
};

export type Activity = {
  id: string;
  dest: string;
  name: string;
  duration: string;
  level: string;
  usdCouple: number;
  sourceUrl: string;
};

export type Seed = {
  title: string;
  currency: "USD";
  pax: number;
  season: string;
  itineraire: Stage[];
  hotels: Hotel[];
  activities: Activity[];
  notes: string[];
};

export const seed = seedJson as Seed;

/** EOLO Calafate est fermé en juillet–août : ne jamais le proposer. */
export function isClosedHotel(hotel: Pick<Hotel, "id" | "name" | "url">): boolean {
  return /eolo/i.test(`${hotel.id} ${hotel.name} ${hotel.url}`);
}

export const hotels: Hotel[] = seed.hotels.filter((hotel) => !isClosedHotel(hotel));
export const activities: Activity[] = seed.activities;
export const stages: Stage[] = seed.itineraire;

export type Day = {
  id: string;
  stageId: string;
  stageLabel: string;
  stageIndex: number;
  dayIndexInStage: number;
  isStageStart: boolean;
};

export const days: Day[] = stages.flatMap((stage, stageIndex) =>
  stage.days.map((id, dayIndexInStage) => ({
    id,
    stageId: stage.id,
    stageLabel: stage.label,
    stageIndex,
    dayIndexInStage,
    isStageStart: dayIndexInStage === 0,
  })),
);

const tierRank: Record<Tier, number> = { luxe: 0, hdg: 1, eco: 2 };

export function hotelsForStage(stageId: string): Hotel[] {
  return hotels
    .filter((hotel) => hotel.nightsAt.includes(stageId))
    .sort(
      (a, b) =>
        tierRank[a.tier] - tierRank[b.tier] ||
        b.usdNightMid - a.usdNightMid ||
        a.name.localeCompare(b.name, "fr"),
    );
}

export function activitiesForStage(stageId: string): Activity[] {
  return activities.filter((activity) => activity.dest === stageId);
}

export function hotelById(id: string): Hotel | undefined {
  return hotels.find((hotel) => hotel.id === id);
}

export function activityById(id: string): Activity | undefined {
  return activities.find((activity) => activity.id === id);
}

export const officialUrls: string[] = [
  ...new Set([...hotels.map((hotel) => hotel.url), ...activities.map((activity) => activity.sourceUrl)]),
];

export const officialUrlSet = new Set(officialUrls);
