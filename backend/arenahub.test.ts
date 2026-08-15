import { describe, expect, it } from "vitest";
import { calculateBookingSubtotal, canOwnerAccessArenaRecord, canPlayerSubmitReview, canTransitionArenaStatus, getOwnerArenaUpdateDecision, getPostSubmissionDocumentDecision, getReviewSubmissionDecision, isWithinCourtAvailability, makeBookingReference, toOwnerArenaRecordPayload, toPlayerReviewStatusPayload } from "./arenahub";

describe("ArenaHub domain rules", () => {
  it("prices court time and equipment only for the booked duration", () => {
    expect(calculateBookingSubtotal(1_200, 2, [{ unitPrice: 150, quantity: 2 }])).toBe(3_000);
  });

  it("allows an arena to become public only after a pending review is approved", () => {
    expect(canTransitionArenaStatus("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionArenaStatus("PENDING", "APPROVED")).toBe(true);
  });

  it("requires a rejected arena to return to draft or pending review before another decision", () => {
    expect(canTransitionArenaStatus("REJECTED", "DRAFT")).toBe(true);
    expect(canTransitionArenaStatus("REJECTED", "PENDING")).toBe(true);
    expect(canTransitionArenaStatus("REJECTED", "APPROVED")).toBe(false);
  });

  it("prices a rental-free booking using only the server-side court rate", () => {
    expect(calculateBookingSubtotal(850, 1.5, [])).toBe(1_275);
  });

  it("creates opaque booking references instead of exposing database identifiers", () => {
    expect(makeBookingReference()).toMatch(/^AH-\d{4}-[A-F0-9]{8}$/);
  });

  it("allows feedback only for one completed booking", () => {
    expect(canPlayerSubmitReview("COMPLETED", false)).toBe(true);
    expect(canPlayerSubmitReview("CONFIRMED", false)).toBe(false);
    expect(canPlayerSubmitReview("COMPLETED", true)).toBe(false);
  });

  it("rejects a second review submission for the same completed booking", () => {
    expect(getReviewSubmissionDecision("COMPLETED", true)).toMatchObject({ allowed: false, code: "CONFLICT", message: "You have already submitted feedback for this booking." });
    expect(getReviewSubmissionDecision("COMPLETED", false)).toEqual({ allowed: true });
  });

  it("returns a minimal player-visible moderation payload for each review state", () => {
    const createdAt = new Date("2026-08-15T00:00:00.000Z");
    for (const status of ["PENDING", "APPROVED", "REJECTED"] as const) {
      expect(toPlayerReviewStatusPayload({ bookingId: { toString: () => "booking-1" }, status, createdAt })).toEqual({ bookingId: "booking-1", status, createdAt });
    }
  });

  it("permits the detailed arena record only to the Arena Owner who owns it", () => {
    expect(canOwnerAccessArenaRecord("owner-1", "owner-1")).toBe(true);
    expect(canOwnerAccessArenaRecord("owner-1", "another-owner")).toBe(false);
  });

  it("allows only the owning Arena Owner to edit a venue and safely returns it to review", () => {
    expect(getOwnerArenaUpdateDecision("owner-1", "another-owner")).toMatchObject({ allowed: false, code: "FORBIDDEN" });
    expect(getOwnerArenaUpdateDecision("owner-1", "owner-1")).toEqual({ allowed: true, nextStatus: "PENDING", nextVerificationStatus: "PENDING", clearRejectionReason: true });
  });

  it("retains document history by treating every additional owner upload as a new pending review item", () => {
    expect(getPostSubmissionDocumentDecision("owner-1", "another-owner", "VERIFICATION_DOCUMENT")).toMatchObject({ allowed: false, code: "FORBIDDEN" });
    expect(getPostSubmissionDocumentDecision("owner-1", "owner-1", "VERIFICATION_DOCUMENT")).toEqual({ allowed: true, kind: "VERIFICATION_DOCUMENT", nextStatus: "PENDING", retainsExistingDocuments: true });
    expect(getPostSubmissionDocumentDecision("owner-1", "owner-1", "ARENA_PHOTO")).toMatchObject({ allowed: true, kind: "ARENA_PHOTO", nextStatus: "PENDING", retainsExistingDocuments: true });
  });

  it("preserves all protected owner record sections without exposing a different response shape", () => {
    const payload = toOwnerArenaRecordPayload({
      arena: { id: "arena-1", status: "PENDING" },
      courts: [{ id: "court-1", name: "Court A" }],
      equipment: [{ id: "equipment-1", name: "Ball" }],
      documents: [{ id: "document-1", storageKey: "private/verification.pdf", status: "PENDING" }],
      reviews: [{ id: "review-1", status: "PENDING" }],
      bookingCount: 4,
    });
    expect(payload).toEqual({
      arena: { id: "arena-1", status: "PENDING" },
      courts: [{ id: "court-1", name: "Court A" }],
      equipment: [{ id: "equipment-1", name: "Ball" }],
      documents: [{ id: "document-1", storageKey: "private/verification.pdf", status: "PENDING" }],
      reviews: [{ id: "review-1", status: "PENDING" }],
      bookingCount: 4,
    });
  });

  it("accepts a booking that fits entirely within an owner-configured operating window", () => {
    const court = { availability: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1260 }] };
    expect(isWithinCourtAvailability(court, new Date("2026-08-17T10:00:00.000Z"), new Date("2026-08-17T11:00:00.000Z"))).toBe(true);
  });

  it("rejects booking windows outside configured hours or across calendar days", () => {
    const court = { availability: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1260 }] };
    expect(isWithinCourtAvailability(court, new Date("2026-08-17T08:00:00.000Z"), new Date("2026-08-17T09:00:00.000Z"))).toBe(false);
    expect(isWithinCourtAvailability(court, new Date("2026-08-17T20:00:00.000Z"), new Date("2026-08-18T10:00:00.000Z"))).toBe(false);
  });

  it("treats an empty availability configuration as open until an owner configures windows", () => {
    expect(isWithinCourtAvailability({ availability: [] }, new Date("2026-08-17T08:00:00.000Z"), new Date("2026-08-17T09:00:00.000Z"))).toBe(true);
  });
});
