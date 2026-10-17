import type { Schedule, TaskStatus, Unit } from "./types";
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(value: string): boolean {
  if (!DATE_RE.test(value) || value < "1900-01-01") return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function todayIn(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addInterval(date: string, count: number, unit: Unit): string {
  if (!validDate(date) || !Number.isInteger(count) || count < 1 || count > 3650)
    throw new Error("Invalid date or interval");
  const d = new Date(`${date}T12:00:00Z`);
  if (unit === "months") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + count);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else d.setUTCDate(d.getUTCDate() + count * (unit === "weeks" ? 7 : 1));
  const result = d.toISOString().slice(0, 10);
  if (!validDate(result))
    throw new Error("Resulting date is outside the supported range");
  return result;
}
export function addDays(date: string, count: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function taskStatus(due: string, today: string): TaskStatus {
  return due < today ? "Overdue" : due === today ? "Due Today" : "Upcoming";
}
export function nextOccurrence(
  done: string,
  count: number,
  unit: Unit,
  end: string | null,
) {
  const date = addInterval(done, count, unit);
  return { date, active: !end || date <= end };
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
export function frequency(
  s: Pick<Schedule, "interval_count" | "interval_unit">,
): string {
  if (s.interval_unit === "days" && s.interval_count === 1) return "Every day";
  if (s.interval_count === 1) return `Every ${s.interval_unit.slice(0, -1)}`;
  return `Every ${s.interval_count} ${s.interval_unit}`;
}
export function projections(
  s: Schedule,
  from: string,
  to: string,
  asOf?: string,
): { date: string; estimated: boolean }[] {
  if (!s.active || s.archived_at) return [];
  const result: { date: string; estimated: boolean }[] = [];
  if (
    s.next_due_date >= from &&
    s.next_due_date <= to &&
    (!s.end_date || s.next_due_date <= s.end_date)
  ) {
    result.push({ date: s.next_due_date, estimated: false });
  }
  // An overdue routine has one real occurrence, not a backlog of invented missed tasks.
  // Its future forecast assumes it will be acted on today; it remains explicitly estimated.
  const anchor = asOf && s.next_due_date < asOf ? asOf : s.next_due_date;
  let date: string;
  try {
    date = addInterval(anchor, s.interval_count, s.interval_unit);
  } catch {
    return result;
  }
  if (s.interval_unit !== "months" && date < from) {
    const step = s.interval_count * (s.interval_unit === "weeks" ? 7 : 1);
    const distance =
      (Date.parse(`${from}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) /
      86400000;
    date = addDays(date, Math.ceil(distance / step) * step);
  }
  for (let n = 0; n < 40000 && date <= to; n++) {
    if (s.end_date && date > s.end_date) break;
    if (date >= from) result.push({ date, estimated: true });
    try {
      date = addInterval(date, s.interval_count, s.interval_unit);
    } catch {
      break;
    }
  }
  return result;
}
