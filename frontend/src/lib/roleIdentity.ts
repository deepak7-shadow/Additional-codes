export type ArenaHubRoleIdentity = "PLAYER" | "OWNER" | "ADMIN";

const identities = {
  PLAYER: { label: "Player", workspaceLabel: "Player workspace", tone: "player" },
  OWNER: { label: "Arena Owner", workspaceLabel: "Arena Owner workspace", tone: "owner" },
  ADMIN: { label: "Administrator", workspaceLabel: "Administrator workspace", tone: "admin" },
} as const;

const workspaceRoleByRoute: Record<string, ArenaHubRoleIdentity> = {
  "/player/dashboard": "PLAYER",
  "/owner/dashboard": "OWNER",
  "/admin/dashboard": "ADMIN",
};

export function getRoleIdentity(role?: string | null) {
  if (role !== "PLAYER" && role !== "OWNER" && role !== "ADMIN") return null;
  return identities[role];
}

export function getWorkspaceRoleIdentity(route: string) {
  return getRoleIdentity(workspaceRoleByRoute[route]);
}
