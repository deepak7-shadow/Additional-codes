import { describe, expect, it } from "vitest";
import { bookingRentalSummary } from "./receipt";

const id = (value: string) => ({ toString: () => value });

describe("booking document rental details", () => {
  it("lists each rental item with its booked quantity and hourly price", () => {
    const summary = bookingRentalSummary(
      [{ equipmentId: id("racket"), quantity: 2, unitPrice: 50 }, { equipmentId: id("balls"), quantity: 1, unitPrice: 30 }],
      [{ _id: id("racket"), name: "Badminton racket" }, { _id: id("balls"), name: "Shuttlecocks" }],
    );

    expect(summary).toContain("2 × Badminton racket");
    expect(summary).toContain("1 × Shuttlecocks");
    expect(summary).toContain("₹50.00/hour");
  });

  it("states explicitly when no equipment rental was selected", () => {
    expect(bookingRentalSummary([], [])).toBe("No rental equipment selected");
  });
});
