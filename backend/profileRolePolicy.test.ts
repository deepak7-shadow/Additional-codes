import { describe, expect, it } from "vitest";
import { getEmailProfileConflictError, getRoleActivationError } from "./profileRolePolicy";

describe("Player and Arena Owner role separation", () => {
  it("does not allow a Player account to activate an Arena Owner profile", () => {
    expect(getRoleActivationError("PLAYER", "OWNER")).toContain("already an active Player profile");
  });

  it("does not allow an Arena Owner account to activate a Player profile", () => {
    expect(getRoleActivationError("OWNER", "PLAYER")).toContain("already an active Arena Owner profile");
  });

  it("allows initial activation and repeat activation for the same role", () => {
    expect(getRoleActivationError(undefined, "PLAYER")).toBeNull();
    expect(getRoleActivationError("OWNER", "OWNER")).toBeNull();
  });

  it("rejects another session attempting to claim an existing email profile", () => {
    expect(getEmailProfileConflictError("owner-open-id", "different-open-id", "owner@example.com")).toContain("already exists for this email");
    expect(getEmailProfileConflictError("owner-open-id", "owner-open-id", "owner@example.com")).toBeNull();
  });

  it("keeps the administrator restriction distinct from self-service profile activation", () => {
    expect(getRoleActivationError("ADMIN", "PLAYER")).toContain("Administrator access cannot be changed");
  });
});
