import { activityById, days, hotelById } from "./catalog";
import type { Selection } from "./presets";
import { legs, transferOption } from "./transfers";

export type MoneyLine = {
  id: string;
  dayId: string;
  label: string;
  amount: number;
};

export type TransferLine = {
  id: string;
  dayId: string;
  title: string;
  modeLabel: string;
  amount: number | null;
};

export type Quote = {
  lodging: number;
  activities: number;
  transfers: number;
  total: number;
  transfersOnRequest: number;
  lodgingLines: MoneyLine[];
  activityLines: MoneyLine[];
  transferLines: TransferLine[];
};

export function quoteSelection(selection: Selection): Quote {
  const lodgingLines: MoneyLine[] = [];
  const activityLines: MoneyLine[] = [];
  let lodging = 0;
  let activities = 0;

  for (const day of days) {
    const hotel = hotelById(selection.hotels[day.id]);
    const activity = activityById(selection.activities[day.id]);
    if (!hotel || !activity) throw new Error(`Sélection incomplète pour ${day.id}`);
    lodging += hotel.usdNightMid;
    activities += activity.usdCouple;
    lodgingLines.push({ id: `h-${day.id}`, dayId: day.id, label: hotel.name, amount: hotel.usdNightMid });
    activityLines.push({
      id: `a-${day.id}`,
      dayId: day.id,
      label: activity.name,
      amount: activity.usdCouple,
    });
  }

  const transferLines: TransferLine[] = [];
  let transfers = 0;
  let transfersOnRequest = 0;

  for (const leg of legs) {
    const option = transferOption(selection.transfers[leg.id]);
    if (option.usdCouple == null) transfersOnRequest += 1;
    else transfers += option.usdCouple;
    transferLines.push({
      id: leg.id,
      dayId: leg.dayId,
      title: leg.title,
      modeLabel: option.label,
      amount: option.usdCouple,
    });
  }

  return {
    lodging,
    activities,
    transfers,
    total: lodging + activities + transfers,
    transfersOnRequest,
    lodgingLines,
    activityLines,
    transferLines,
  };
}
