import { describe, expect, it } from "vitest";
import { getRoleIdentity, getWorkspaceRoleIdentity } from "../frontend/src/lib/roleIdentity";

describe("role workspace identity", () => {
  it("assigns a distinct identity for Player, Arena Owner, and Administrator workspaces", () => {
    expect(getRoleIdentity("PLAYER")).toEqual({ label: "Player", workspaceLabel: "Player workspace", tone: "player" });
    expect(getRoleIdentity("OWNER")).toEqual({ label: "Arena Owner", workspaceLabel: "Arena Owner workspace", tone: "owner" });
    expect(getRoleIdentity("ADMIN")).toEqual({ label: "Administrator", workspaceLabel: "Administrator workspace", tone: "admin" });
  });

  it("does not assign a role identity to an unrecognized role", () => {
    expect(getRoleIdentity("guest")).toBeNull();
  });

  it("maps each canonical dashboard route to its explicit workspace identity", () => {
    expect(getWorkspaceRoleIdentity("/player/dashboard")?.workspaceLabel).toBe("Player workspace");
    expect(getWorkspaceRoleIdentity("/owner/dashboard")?.workspaceLabel).toBe("Arena Owner workspace");
    expect(getWorkspaceRoleIdentity("/admin/dashboard")?.workspaceLabel).toBe("Administrator workspace");
    expect(getWorkspaceRoleIdentity("/discover")).toBeNull();
  });
});
