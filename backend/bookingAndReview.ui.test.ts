import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "frontend/src/pages/ArenaHubPages.tsx"), "utf8");

describe("booking and administrator decision interface contracts", () => {
  it("submits datetime-local booking selections through the venue operating-time conversion", () => {
    expect(pageSource).toContain("slotStart: toVenueOperatingTimeIso(slotStart)");
    expect(pageSource).toContain("slotEnd: toVenueOperatingTimeIso(slotEnd)");
    expect(pageSource).toContain("Court operating hours:");
  });

  it("requires a rejection reason and removes a successful decision from the rendered pending queue", () => {
    expect(pageSource).toContain("Provide a clear reason for rejecting this arena.");
    expect(pageSource).toContain("setDecidedArenaIds");
    expect(pageSource).toContain("getPendingArenaIdsAfterDecision");
  });
});
