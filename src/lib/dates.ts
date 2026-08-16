export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/** '2026-07' -> 'يوليو 2026' */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${AR_MONTHS[(m ?? 1) - 1] ?? ym} ${y}`;
}

/** '2026-07' -> 'يوليو' truncated for chart axes */
export function monthShort(ym: string): string {
  const m = Number(ym.split("-")[1]);
  return (AR_MONTHS[m - 1] ?? ym).slice(0, 5);
}

export function ymOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
