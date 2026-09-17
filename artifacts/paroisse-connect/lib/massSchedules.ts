export const MASS_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

export type MassDay = (typeof MASS_DAYS)[number];
export type MassScheduleMode = "recurring" | "specific";

export interface MassScheduleEntry {
  id: string;
  mode: MassScheduleMode;
  day?: string;
  date?: string;
  startTime: string;
  endTime?: string;
  location: string;
  address: string;
  celebrationType: string;
  category?: string;
  note?: string;
  legacy?: boolean;
}

export interface LegacyMassScheduleEntry {
  mode?: MassScheduleMode;
  day?: string;
  jours?: string[];
  date?: string;
  time?: string;
  heure?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  celebrationType?: string;
  category?: string;
  lieu?: string;
  location?: string;
  adresse?: string;
  address?: string;
  recurrence?: string;
  dateSpeciale?: string;
  note?: string;
}

export interface ParishScheduleSource {
  massSchedules?: LegacyMassScheduleEntry[];
  massSchedule?: LegacyMassScheduleEntry[];
  churchName?: string;
  address?: string;
}

export const DAY_ORDER: Record<string, number> = {
  Lundi: 1,
  Mardi: 2,
  Mercredi: 3,
  Jeudi: 4,
  Vendredi: 5,
  Samedi: 6,
  Dimanche: 7,
};

export function normalizeMassSchedule(
  raw: LegacyMassScheduleEntry,
  id: string,
  defaults?: Pick<ParishScheduleSource, "churchName" | "address">,
): MassScheduleEntry {
  const mode: MassScheduleMode =
    raw.mode === "specific" ||
    raw.recurrence === "unique" ||
    !!raw.dateSpeciale ||
    !!raw.date
      ? "specific"
      : "recurring";

  const day = raw.day ?? raw.jours?.[0];
  const date = raw.date ?? raw.dateSpeciale;

  return {
    id,
    mode,
    ...(day ? { day } : {}),
    ...(date ? { date } : {}),
    startTime: raw.startTime ?? raw.time ?? raw.heure ?? "",
    ...(raw.endTime ? { endTime: raw.endTime } : {}),
    location: raw.location ?? raw.lieu ?? defaults?.churchName ?? "Lieu à préciser",
    address: raw.address ?? raw.adresse ?? defaults?.address ?? "",
    celebrationType: raw.celebrationType ?? raw.type ?? "Messe",
    ...(raw.category ? { category: raw.category } : {}),
    ...(raw.note ? { note: raw.note } : {}),
    legacy: true,
  };
}

export function normalizeMassSchedules(
  source: ParishScheduleSource,
  subcollectionEntries: LegacyMassScheduleEntry[] = [],
): MassScheduleEntry[] {
  const entries: MassScheduleEntry[] = [];
  const seen = new Set<string>();

  const append = (raw: LegacyMassScheduleEntry, id: string) => {
    const normalized = normalizeMassSchedule(raw, id, source);
    const identity = [
      normalized.mode,
      normalized.day ?? normalized.date ?? "",
      normalized.startTime,
      normalized.location,
      normalized.celebrationType,
      normalized.category ?? "",
    ].join("|");
    if (seen.has(identity)) return;
    seen.add(identity);
    entries.push(normalized);
  };

  (source.massSchedules ?? []).forEach((entry, index) => append(entry, `schedule_${index}`));
  subcollectionEntries.forEach((entry, index) => append(entry, `subschedule_${index}`));

  (source.massSchedule ?? []).forEach((entry, index) => {
    const days = entry.jours?.length ? entry.jours : [entry.day ?? "Dimanche"];
    days.forEach((day, dayIndex) =>
      append({ ...entry, day }, `legacy_${index}_${dayIndex}`),
    );
  });

  return entries;
}

export function sortMassSchedules(entries: MassScheduleEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.mode !== b.mode) return a.mode === "specific" ? -1 : 1;
    if (a.mode === "specific") {
      return `${a.date ?? ""}${a.startTime}`.localeCompare(`${b.date ?? ""}${b.startTime}`);
    }
    const dayDiff = (DAY_ORDER[a.day ?? ""] ?? 99) - (DAY_ORDER[b.day ?? ""] ?? 99);
    return dayDiff !== 0 ? dayDiff : a.startTime.localeCompare(b.startTime);
  });
}