import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("workspace role indicator UI contracts", () => {
  const playerDashboard = readProjectFile("frontend/src/components/PlayerDashboardV2.tsx");
  const arenaHubPages = readProjectFile("frontend/src/pages/ArenaHubPages.tsx");

  it("renders the Player workspace indicator in the player dashboard", () => {
    expect(playerDashboard).toContain('getWorkspaceRoleIdentity("/player/dashboard")');
    expect(playerDashboard).toContain("workspace-role-${playerIdentity.tone}");
    expect(playerDashboard).toContain("{playerIdentity.workspaceLabel}");
  });

  it("renders the Arena Owner workspace indicator in the owner dashboard", () => {
    expect(arenaHubPages).toContain('getWorkspaceRoleIdentity("/owner/dashboard")');
    expect(arenaHubPages).toContain("workspace-role-${ownerIdentity.tone}");
    expect(arenaHubPages).toContain("{ownerIdentity.workspaceLabel}");
  });

  it("renders the Administrator workspace indicator in the administrator dashboard", () => {
    expect(arenaHubPages).toContain('getWorkspaceRoleIdentity("/admin/dashboard")');
    expect(arenaHubPages).toContain("workspace-role-${adminIdentity.tone}");
    expect(arenaHubPages).toContain("{adminIdentity.workspaceLabel}");
  });
});
