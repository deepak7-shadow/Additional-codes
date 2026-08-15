export const DESIGNATED_APPROVAL_ADMIN_EMAIL = "deepak843161.438@gmail.com";

/**
 * Approval actions remain separate from generic administrative access. This
 * ensures that a secondary administrator cannot publish, reject, or moderate
 * marketplace content without the named approver's authenticated email.
 */
export function canApproveArenaOperations(email: string | null | undefined) {
  return email?.trim().toLowerCase() === DESIGNATED_APPROVAL_ADMIN_EMAIL;
}
