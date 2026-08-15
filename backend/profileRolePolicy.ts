export type SelfServiceRole = "PLAYER" | "OWNER";

export function roleLabel(role: SelfServiceRole) {
  return role === "OWNER" ? "Arena Owner" : "Player";
}

export function getRoleActivationError(existingRole: SelfServiceRole | "ADMIN" | undefined, requestedRole: SelfServiceRole) {
  if (!existingRole || existingRole === requestedRole) return null;
  if (existingRole === "ADMIN") return "Administrator access cannot be changed through self-service role activation.";
  return `This account is already an active ${roleLabel(existingRole)} profile. Use a different email address to create a separate ${roleLabel(requestedRole)} account.`;
}

export function getEmailProfileConflictError(existingOpenId: string | undefined, currentOpenId: string, email: string | null | undefined) {
  if (!email || !existingOpenId || existingOpenId === currentOpenId) return null;
  return "An ArenaHub profile already exists for this email address. Sign in to that account or use a different email address.";
}
