/** Unit conversions and geo math. Pure functions, no state. */

export const METERS_PER_MILE = 1609.344;
export const EARTH_RADIUS_M = 6_371_008.8; // mean Earth radius (IUGG)

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two fixes, in meters (haversine). */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Speed (m/s) → pace (seconds per mile). Returns Infinity when stopped. */
export function mpsToPaceSecPerMile(speedMps: number): number {
  if (speedMps <= 0) return Infinity;
  return METERS_PER_MILE / speedMps;
}

/** Pace (seconds per mile) → speed (m/s). Returns 0 for infinite pace. */
export function paceSecPerMileToMps(paceSecPerMile: number): number {
  if (!isFinite(paceSecPerMile) || paceSecPerMile <= 0) return 0;
  return METERS_PER_MILE / paceSecPerMile;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/** Format a pace in seconds-per-mile as "M:SS" (e.g. 480 → "8:00"). */
export function formatPace(secPerMile: number | null): string {
  if (secPerMile === null || !isFinite(secPerMile)) return '--:--';
  const total = Math.round(secPerMile);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format a duration in ms as "H:MM:SS" or "M:SS". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
