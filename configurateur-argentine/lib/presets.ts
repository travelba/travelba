import {
  activitiesForStage,
  days,
  hotelsForStage,
  stages,
  type Activity,
  type Hotel,
  type Tier,
} from "./catalog";
import { legs, type TransferMode } from "./transfers";

export type PresetId = Tier;

export type Selection = {
  hotels: Record<string, string>;
  activities: Record<string, string>;
  transfers: Record<string, TransferMode>;
};

function byNightlyAsc(a: Hotel, b: Hotel): number {
  return a.usdNightMid - b.usdNightMid || a.name.localeCompare(b.name, "fr");
}

/** Luxe = hôtel par défaut du seed. Moins cher = nuit la plus basse. Haut de gamme = palier hdg, ou le tarif médian s’il se confond avec un autre palier. */
export function pickHotel(stageId: string, tier: Tier): Hotel {
  const stage = stages.find((item) => item.id === stageId);
  const list = hotelsForStage(stageId);
  if (!stage || list.length === 0) throw new Error(`Aucun hôtel pour ${stageId}`);

  const cheapest = [...list].sort(byNightlyAsc)[0];
  if (tier === "eco") return cheapest;

  const preferred = list.find((hotel) => hotel.id === stage.defaultHotel) ?? cheapest;
  if (tier === "luxe") return preferred;

  const hdg = list.filter((hotel) => hotel.tier === "hdg").sort(byNightlyAsc);
  const distinctHdg = hdg.find((hotel) => hotel.id !== cheapest.id && hotel.id !== preferred.id);
  if (distinctHdg) return distinctHdg;
  if (hdg[0] && hdg[0].id !== cheapest.id) return hdg[0];

  const middle = [...list].sort(byNightlyAsc).find((hotel) => hotel.id !== cheapest.id && hotel.id !== preferred.id);
  return middle ?? hdg[0] ?? cheapest;
}

export function orderActivities(list: Activity[], tier: Tier): Activity[] {
  const sorted = [...list].sort(
    (a, b) => b.usdCouple - a.usdCouple || a.name.localeCompare(b.name, "fr"),
  );
  if (tier === "luxe") return sorted;
  if (tier === "eco") return [...sorted].reverse();
  const mid = Math.floor((sorted.length - 1) / 2);
  return [...sorted.slice(mid), ...sorted.slice(0, mid)];
}

export function selectionForPreset(tier: Tier): Selection {
  const hotelIds: Record<string, string> = {};
  const activityIds: Record<string, string> = {};

  for (const stage of stages) {
    const hotel = pickHotel(stage.id, tier);
    const ordered = orderActivities(activitiesForStage(stage.id), tier);
    if (ordered.length === 0) throw new Error(`Aucune activité pour ${stage.id}`);
    stage.days.forEach((dayId, index) => {
      hotelIds[dayId] = hotel.id;
      activityIds[dayId] = ordered[index % ordered.length].id;
    });
  }

  const mode: TransferMode = tier === "eco" ? "partage" : "prive";
  const transferIds: Record<string, TransferMode> = {};
  for (const leg of legs) transferIds[leg.id] = mode;

  return { hotels: hotelIds, activities: activityIds, transfers: transferIds };
}

export function sanitizeSelection(raw: Partial<Selection> | null | undefined): Selection {
  const base = selectionForPreset("luxe");
  if (!raw) return base;

  for (const day of days) {
    if (hotelsForStage(day.stageId).some((hotel) => hotel.id === raw.hotels?.[day.id])) {
      base.hotels[day.id] = raw.hotels![day.id];
    }
    if (activitiesForStage(day.stageId).some((activity) => activity.id === raw.activities?.[day.id])) {
      base.activities[day.id] = raw.activities![day.id];
    }
  }

  for (const leg of legs) {
    const mode = raw.transfers?.[leg.id];
    if (mode === "prive" || mode === "partage" || mode === "aucun") base.transfers[leg.id] = mode;
  }

  return base;
}
