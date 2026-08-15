import { afterAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { Booking, Review, getArenaHubDatabase } from "./arenahub";

describe("MongoDB Atlas configuration", () => {
  it("connects through the configured server-only connection string and responds to a ping", async () => {
    const database = await getArenaHubDatabase();
    expect(database?.connection.readyState).toBe(1);
    const result = await database?.connection.db?.admin().command({ ping: 1 });
    expect(result).toMatchObject({ ok: 1 });
  }, 35_000);

  it("reads only real booking-backed feedback already present in Atlas without seeding data", async () => {
    await getArenaHubDatabase();
    const reviews = await Review.find({}).select({ bookingId: 1, playerOpenId: 1, status: 1, rating: 1 }).lean();
    for (const review of reviews) {
      const booking = await Booking.findById(review.bookingId).select({ status: 1, playerOpenId: 1 }).lean();
      expect(booking).toBeTruthy();
      expect(booking?.status).toBe("COMPLETED");
      expect(booking?.playerOpenId).toBe(review.playerOpenId);
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(["PENDING", "APPROVED", "REJECTED"]).toContain(review.status);
    }
  }, 35_000);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}, 35_000);
