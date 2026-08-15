import { describe, expect, it } from "vitest";
import { canApproveArenaOperations, DESIGNATED_APPROVAL_ADMIN_EMAIL } from "./approvalAuthorization";

describe("named arena approval authority", () => {
  it("permits only the designated administrator email", () => {
    expect(canApproveArenaOperations(DESIGNATED_APPROVAL_ADMIN_EMAIL)).toBe(true);
    expect(canApproveArenaOperations("DEEPAK843161.438@GMAIL.COM")).toBe(true);
    expect(canApproveArenaOperations("another-admin@example.com")).toBe(false);
    expect(canApproveArenaOperations(null)).toBe(false);
  });
});
