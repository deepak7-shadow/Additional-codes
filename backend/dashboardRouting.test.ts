import { describe, expect, it } from "vitest";
import { canRequestPlayerDashboardData, dashboardDestination } from "../frontend/src/lib/dashboardRouting";

describe("dashboard role routing", () => {
  it("sends an administrator to the protected administrator workspace", () => {
    expect(dashboardDestination("admin", undefined)).toBe("/admin/dashboard");
  });

  it("sends owner and player profiles to their correct workspaces", () => {
    expect(dashboardDestination("user", "OWNER")).toBe("/owner/dashboard");
    expect(dashboardDestination("user", "PLAYER")).toBe("/player/dashboard");
  });

  it("never enables Player-only data for administrator or owner accounts", () => {
    expect(canRequestPlayerDashboardData("admin", "PLAYER")).toBe(false);
    expect(canRequestPlayerDashboardData("user", "OWNER")).toBe(false);
    expect(canRequestPlayerDashboardData("user", "PLAYER")).toBe(true);
  });
});
