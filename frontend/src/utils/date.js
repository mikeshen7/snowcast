const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfWeekSunday(date) {
  const base = startOfDay(date);
  const day = base.getDay();
  return addDays(base, -day);
}

export function buildCalendarRange(today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const start = startOfWeekSunday(monthStart);
  const end = addDays(monthEnd, 6 - monthEnd.getDay());
  const days = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return { start, end, days, weeks };
}

export function formatMonthYear(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatShortDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekday(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

export function differenceInDays(date, baseDate) {
  const start = startOfDay(date).getTime();
  const base = startOfDay(baseDate).getTime();
  return Math.round((start - base) / DAY_MS);
}

export function dayRangeToEpoch(start, end) {
  const startEpoch = startOfDay(start).getTime();
  const endEpoch = startOfDay(end).getTime() + DAY_MS - 1;
  return { startEpoch, endEpoch };
}
