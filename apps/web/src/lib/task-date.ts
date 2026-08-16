const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isTaskCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export function todayCalendarDate(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatTaskCalendarDate(value: string | null): string {
  if (!value || !isTaskCalendarDate(value)) return "—";
  const [year, month, day] = value.split("-").map(Number);
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  return `${monthName} ${day}, ${year}`;
}

export function compareTaskCalendarDates(left: string, right: string): number {
  return left.localeCompare(right);
}
