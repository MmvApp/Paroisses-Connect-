export const EVENT_CATEGORIES = [
  "Messe",
  "Pèlerinage",
  "Catéchisme",
  "Rencontre",
  "Jeunes",
  "Concert",
  "Caritatif",
  "Autre",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

const CATEGORY_BY_KEY: Record<string, EventCategory> = {
  messe: "Messe",
  pelerinage: "Pèlerinage",
  catechisme: "Catéchisme",
  rencontre: "Rencontre",
  jeunes: "Jeunes",
  concert: "Concert",
  caritatif: "Caritatif",
  autre: "Autre",
};

function categoryKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : "";
}

export function normalizeEventCategory(value: unknown): EventCategory | null {
  return CATEGORY_BY_KEY[categoryKey(value)] ?? null;
}

/**
 * Converts both current and legacy parish schedule types to the Agenda
 * categories without changing the stored schedule data.
 *
 * Adoration, confession and permanence are valid parish schedules, but they
 * are not one of the Agenda category filters. They remain visible in Tous.
 */
export function getMassScheduleAgendaCategory(schedule: {
  type?: unknown;
  celebrationType?: unknown;
  category?: unknown;
}): EventCategory | null {
  const explicitCategory = normalizeEventCategory(schedule.category);
  if (explicitCategory) return explicitCategory;

  const rawType = categoryKey(schedule.celebrationType ?? schedule.type);
  if (rawType === "evenement") return "Autre";
  return normalizeEventCategory(rawType);
}