export type OperatingHourOption = { value: string; label: string };

function displayHour(hour: number, nextDay = false) {
  const normalized = hour === 24 ? 0 : hour;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const hour12 = normalized % 12 || 12;
  return `${hour12}:00 ${suffix}${nextDay ? " (next day)" : ""}`;
}

export const courtStartHourOptions: OperatingHourOption[] = Array.from(
  { length: 24 },
  (_, hour) => ({ value: String(hour), label: displayHour(hour) }),
);

export const courtEndHourOptions: OperatingHourOption[] = Array.from(
  { length: 24 },
  (_, index) => {
    const hour = index + 1;
    return { value: String(hour), label: displayHour(hour, hour === 24) };
  },
);

export function weeklyAvailabilityFromHours(startHour: string, endHour: string) {
  const start = Number(startHour);
  const end = Number(endHour);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24 || end <= start) return null;
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: start * 60, endMinute: end * 60 }));
}

export function formatOperatingWindow(startMinute: number, endMinute: number) {
  const startHour = Math.floor(startMinute / 60);
  const endHour = Math.floor(endMinute / 60);
  return `${displayHour(startHour)} – ${displayHour(endHour, endHour === 24)}`;
}
