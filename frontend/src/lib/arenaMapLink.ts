export type ArenaMapLocation = {
  latitude: number;
  longitude: number;
};

export function arenaMapUrl(location: ArenaMapLocation | null | undefined) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  if (location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}
