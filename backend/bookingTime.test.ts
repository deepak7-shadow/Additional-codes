import { describe, expect, it } from "vitest";
import { formatVenueBookingTime, toVenueOperatingTimeIso } from "../frontend/src/lib/bookingTime";

describe("booking operating-time contract", () => {
  it("keeps a datetime-local court selection on the configured venue clock", () => {
    expect(toVenueOperatingTimeIso("2026-08-17T10:30")).toBe("2026-08-17T10:30:00.000Z");
    expect(formatVenueBookingTime("2026-08-17T10:30:00.000Z")).toContain("10:30 am");
  });

  it("rejects incomplete local booking selections before a quote request", () => {
    expect(() => toVenueOperatingTimeIso("2026-08-17")).toThrow("complete booking date and time");
  });
});
