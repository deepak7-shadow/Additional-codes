import { describe, expect, it } from "vitest";
import { dashboardDestination, isSelfServiceSignupRole, signupDestination, signupReturnPath } from "../frontend/src/lib/signupFlow";

describe("role-specific sign-up flow", () => {
  it("routes Player, Owner, and Administrator choices to their separate entry points", () => {
    expect(signupDestination("PLAYER")).toBe("/player/dashboard");
    expect(signupDestination("OWNER")).toBe("/owner/dashboard");
    expect(signupDestination("ADMIN")).toBe("/admin/dashboard");
    expect(signupReturnPath("OWNER")).toBe("/join?role=owner");
  });

  it("keeps each post-sign-up dashboard destination distinct", () => {
    expect(new Set([dashboardDestination("PLAYER"), dashboardDestination("OWNER"), dashboardDestination("ADMIN")]).size).toBe(3);
  });

  it("does not model administrator access as a self-service sign-up role", () => {
    expect(isSelfServiceSignupRole("PLAYER")).toBe(true);
    expect(isSelfServiceSignupRole("OWNER")).toBe(true);
    expect(isSelfServiceSignupRole("ADMIN")).toBe(false);
  });
});
