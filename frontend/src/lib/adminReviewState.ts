export function getReviewSelectionAfterArenaDecision(selectedArenaId: string, decidedArenaId: string) {
  return selectedArenaId === decidedArenaId ? "" : selectedArenaId;
}

export function getPendingArenaIdsAfterDecision(arenaIds: string[], decidedArenaId: string) {
  return arenaIds.filter(arenaId => arenaId !== decidedArenaId);
}

export function normalizeArenaRejectionReason(value: string | null) {
  const reason = value?.trim();
  return reason && reason.length >= 5 ? reason : null;
}
