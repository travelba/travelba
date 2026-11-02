/** Début de la fenêtre « appliqués automatiquement (24 h) ». */
export function appliedSinceIso(now = Date.now()) {
  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
}

/** Compteurs d’une semaine d’import. Les temps sont en millisecondes. */

export type ImportMetricEvent = {
  action: "auto_apply" | "human_apply" | "ignore" | "duplicate" | "undo";
  edited: boolean;
  wrongIgnore: boolean;
  clicks: number;
  waitMs: number;
};

export function importWeekMetrics(events: ImportMetricEvent[]) {
  const auto = events.filter((row) => row.action === "auto_apply");
  const human = events.filter((row) => row.action === "human_apply");
  const waits = events.map((row) => row.waitMs).filter((ms) => ms >= 0).sort((a, b) => a - b);
  const mid = waits.length ? waits[Math.floor((waits.length - 1) / 2)] : 0;
  const clicks = human.reduce((sum, row) => sum + row.clicks, 0);
  return {
    autoSansRetouche: auto.filter((row) => !row.edited).length,
    doublons: events.filter((row) => row.action === "duplicate").length,
    ignoresATort: events.filter((row) => row.wrongIgnore).length,
    tempsMedianMs: mid,
    clicsMoyens: human.length ? Math.round((clicks / human.length) * 10) / 10 : 0,
  };
}
