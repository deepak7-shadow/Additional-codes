export type SignupRole = "PLAYER" | "OWNER" | "ADMIN";

export function dashboardDestination(role: SignupRole) {
  if (role === "OWNER") return "/owner/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  return "/player/dashboard";
}

export function signupDestination(role: SignupRole) {
  return dashboardDestination(role);
}

export function signupReturnPath(role: SignupRole) {
  return `/join?role=${role.toLowerCase()}`;
}

export function isSelfServiceSignupRole(role: SignupRole) {
  return role === "PLAYER" || role === "OWNER";
}
