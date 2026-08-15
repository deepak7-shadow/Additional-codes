import { describe, expect, it } from "vitest";
import { getPendingArenaIdsAfterDecision, getReviewSelectionAfterArenaDecision, normalizeArenaRejectionReason } from "../frontend/src/lib/adminReviewState";

describe("administrator review selection", () => {
  it("clears the open record after that arena is approved or rejected", () => {
    expect(getReviewSelectionAfterArenaDecision("arena-1", "arena-1")).toBe("");
  });

  it("keeps a different pending record open when a queue action decides another arena", () => {
    expect(getReviewSelectionAfterArenaDecision("arena-1", "arena-2")).toBe("arena-1");
  });

  it("removes a decided arena immediately from the rendered pending identifiers", () => {
    expect(getPendingArenaIdsAfterDecision(["arena-a", "arena-b"], "arena-a")).toEqual(["arena-b"]);
  });

  it("requires a meaningful reason before sending an arena rejection", () => {
    expect(normalizeArenaRejectionReason("  venue evidence is incomplete  ")).toBe("venue evidence is incomplete");
    expect(normalizeArenaRejectionReason("no")).toBeNull();
  });
});
