export type WorkspaceProfileRole = "PLAYER" | "OWNER" | "ADMIN" | null | undefined;

export function dashboardDestination(systemRole: string | null | undefined, profileRole: WorkspaceProfileRole) {
  if (systemRole === "admin" || profileRole === "ADMIN") return "/admin/dashboard";
  if (profileRole === "OWNER") return "/owner/dashboard";
  return "/player/dashboard";
}

export function canRequestPlayerDashboardData(systemRole: string | null | undefined, profileRole: WorkspaceProfileRole) {
  return systemRole !== "admin" && profileRole === "PLAYER";
}
