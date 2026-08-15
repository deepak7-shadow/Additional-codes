import { describe, expect, it } from "vitest";
import { courtEndHourOptions, courtStartHourOptions, formatOperatingWindow, weeklyAvailabilityFromHours } from "../frontend/src/lib/operatingHours";

describe("owner operating-hour controls", () => {
  it("shows clear AM/PM labels while preserving the 24-hour storage values", () => {
    expect(courtStartHourOptions.find(option => option.value === "6")?.label).toBe("6:00 AM");
    expect(courtEndHourOptions.find(option => option.value === "22")?.label).toBe("10:00 PM");
    expect(courtEndHourOptions.find(option => option.value === "24")?.label).toBe("12:00 AM (next day)");
  });

  it("converts valid AM/PM selections into seven minute-based operating windows", () => {
    expect(weeklyAvailabilityFromHours("6", "22")).toEqual([
      { dayOfWeek: 0, startMinute: 360, endMinute: 1320 },
      { dayOfWeek: 1, startMinute: 360, endMinute: 1320 },
      { dayOfWeek: 2, startMinute: 360, endMinute: 1320 },
      { dayOfWeek: 3, startMinute: 360, endMinute: 1320 },
      { dayOfWeek: 4, startMinute: 360, endMinute: 1320 },
      { dayOfWeek: 5, startMinute: 360, endMinute: 1320 },
      { dayOfWeek: 6, startMinute: 360, endMinute: 1320 },
    ]);
    expect(weeklyAvailabilityFromHours("22", "6")).toBeNull();
    expect(formatOperatingWindow(360, 1320)).toBe("6:00 AM – 10:00 PM");
  });
});
