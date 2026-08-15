import { describe, expect, it } from "vitest";
import { arenaMapUrl } from "./arenaMapLink";

describe("arenaMapUrl", () => {
  it("creates an exact Google Maps destination from saved latitude and longitude", () => {
    expect(arenaMapUrl({ latitude: 12.9716, longitude: 77.5946 })).toBe("https://www.google.com/maps/search/?api=1&query=12.9716%2C77.5946");
  });

  it("does not create a location action when coordinates are absent or invalid", () => {
    expect(arenaMapUrl(null)).toBeNull();
    expect(arenaMapUrl({ latitude: 91, longitude: 77.5946 })).toBeNull();
    expect(arenaMapUrl({ latitude: 12.9716, longitude: Number.NaN })).toBeNull();
  });
});
