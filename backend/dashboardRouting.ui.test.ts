import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

describe("dashboard role-routing UI contract", () => {
  it("uses the role-aware landing component for the generic dashboard route", () => {
    const app = read("frontend/src/App.tsx");
    const pages = read("frontend/src/pages/ArenaHubPages.tsx");

    expect(app).toContain('component={DashboardLandingPage}');
    expect(pages).toContain('dashboardDestination(user?.role, profile.data?.role)');
    expect(pages).toContain('setLocation(destination)');
  });

  it("guards Player-only dashboard queries with the current system and profile roles", () => {
    const dashboard = read("frontend/src/components/PlayerDashboardV2.tsx");

    expect(dashboard).toContain('const isAdministrator = user?.role === "admin"');
    expect(dashboard).toContain('canRequestPlayerDashboardData(user?.role, profile.data?.role)');
    expect(dashboard).toContain('{ enabled: canLoadPlayerData }');
    expect(dashboard).toContain('if (isAdministrator) return');
  });
});
