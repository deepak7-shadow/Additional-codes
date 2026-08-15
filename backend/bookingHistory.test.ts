import { describe, expect, it } from "vitest";
import { filterAndSortBookings } from "../frontend/src/lib/bookingHistory";

const now = new Date("2026-08-15T00:00:00.000Z").getTime();
const bookings = [
  { reference: "AH-ONE", sport: "Tennis", status: "COMPLETED", slotStart: "2026-08-12T10:00:00.000Z", createdAt: "2026-08-01T10:00:00.000Z", subtotal: 800 },
  { reference: "AH-TWO", sport: "Football", status: "CONFIRMED", slotStart: "2026-08-20T10:00:00.000Z", createdAt: "2026-08-12T10:00:00.000Z", subtotal: 1800 },
  { reference: "AH-THREE", sport: "Tennis", status: "CONFIRMED", slotStart: "2026-09-10T10:00:00.000Z", createdAt: "2026-08-14T10:00:00.000Z", subtotal: 1200 },
];

describe("filterAndSortBookings", () => {
  it("combines query, status, and date-window filters without mutating source data", () => {
    const source = [...bookings];
    const result = filterAndSortBookings(source, { query: "", sport: "Tennis", status: "CONFIRMED", dateWindow: "30-days", sort: "slot-desc", now });
    expect(result.map(item => item.reference)).toEqual(["AH-THREE"]);
    expect(source.map(item => item.reference)).toEqual(["AH-ONE", "AH-TWO", "AH-THREE"]);
  });

  it("sorts matching bookings by requested cost or chronological order", () => {
    expect(filterAndSortBookings(bookings, { query: "", status: "all", dateWindow: "all", sort: "cost-desc", now }).map(item => item.reference)).toEqual(["AH-TWO", "AH-THREE", "AH-ONE"]);
    expect(filterAndSortBookings(bookings, { query: "", status: "all", dateWindow: "all", sort: "slot-asc", now }).map(item => item.reference)).toEqual(["AH-ONE", "AH-TWO", "AH-THREE"]);
  });

  it("filters by sport independently from free-text search", () => {
    const result = filterAndSortBookings(bookings, { query: "", sport: "Football", status: "all", dateWindow: "all", sort: "slot-desc", now });
    expect(result.map(item => item.reference)).toEqual(["AH-TWO"]);
  });
});
