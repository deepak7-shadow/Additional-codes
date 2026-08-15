const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Court availability is stored as venue wall-clock minutes. Keep a datetime-local
 * selection on that same clock when sending it to the UTC-persisted booking model.
 */
export function toVenueOperatingTimeIso(value: string) {
  if (!localDateTimePattern.test(value)) throw new Error("Choose a complete booking date and time.");
  const parsed = new Date(`${value}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Choose a valid booking date and time.");
  return parsed.toISOString();
}

export function formatVenueBookingTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
