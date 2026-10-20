export const QUALITY_FLAGS = ["escalation", "injection", "leak_attempt", "thin", "complaint"] as const;
export type QualityFlag = (typeof QUALITY_FLAGS)[number];

export type QualityMark = {
  flag: QualityFlag;
  phone: string;
  note: string;
  at: string;
};

const INJECTION = /ignore (les|the) (consignes|instructions|rules)|autre client|other client|system prompt|révèle|reveal/i;

export function qualityMarks(input: {
  phone: string;
  message: string;
  handoff: string | null;
  foreignReference: boolean;
  at?: string;
}): QualityMark[] {
  const at = input.at || new Date().toISOString();
  const marks: QualityMark[] = [];
  if (INJECTION.test(input.message)) {
    marks.push({ flag: "injection", phone: input.phone, note: "Consigne dans le message.", at });
  }
  if (input.foreignReference) {
    marks.push({ flag: "leak_attempt", phone: input.phone, note: "Référence hors dossier.", at });
  }
  if (input.handoff === "urgent") {
    marks.push({ flag: "escalation", phone: input.phone, note: "Urgence.", at });
  }
  if (input.handoff === "complaint") {
    marks.push({ flag: "complaint", phone: input.phone, note: "Plainte.", at });
  }
  return marks;
}

export type WeeklyLine = { flag: QualityFlag; count: number };

/** Semaine calendaire de Paris, du lundi 0 h au lundi suivant. */
export function weeklyReview(marks: QualityMark[], now: Date): { from: string; to: string; lines: WeeklyLine[]; total: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekday = pick("weekday");
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[weekday] ?? 0;
  const day = `${pick("year")}-${pick("month")}-${pick("day")}`;
  const start = new Date(`${day}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - offset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const inside = marks.filter((mark) => {
    const at = new Date(mark.at).getTime();
    return at >= start.getTime() && at < end.getTime();
  });
  const lines = QUALITY_FLAGS.map((flag) => ({
    flag,
    count: inside.filter((mark) => mark.flag === flag).length,
  })).filter((line) => line.count > 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), lines, total: inside.length };
}
