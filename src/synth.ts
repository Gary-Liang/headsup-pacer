import type { GeoFix } from './types.js';
import { METERS_PER_MILE, EARTH_RADIUS_M, paceSecPerMileToMps } from './units.js';

/**
 * Synthesizes a GPS fix stream from a pace profile — the simulator workhorse
 * (spec §5/§9 weekends 1–3, all $0 in the Lens Studio simulator). Each segment
 * is `[durationSec, paceSecPerMile]`; the runner walks due east along a single
 * latitude so distances are exact and easy to reason about in tests.
 */
export interface SynthOptions {
  startTimeMs?: number;
  startLat?: number;
  startLon?: number;
  sampleHz?: number;
  accuracyMeters?: number;
  /** Optional per-fix lateral jitter (m) to exercise the smoother. */
  jitterMeters?: number;
}

export type PaceSegment = [durationSec: number, paceSecPerMile: number];

// Use the SAME Earth model as haversine (units.ts) so a synthesized path of N
// meters reads back as exactly N meters through the engine — no model mismatch.
const METERS_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_M) / 180;
const DEG_PER_M_LAT = 1 / METERS_PER_DEG_LAT;

export function synthFixes(segments: PaceSegment[], opts: SynthOptions = {}): GeoFix[] {
  const startTimeMs = opts.startTimeMs ?? 0;
  const startLat = opts.startLat ?? 37.3861; // Sunnyvale-ish; arbitrary
  const startLon = opts.startLon ?? -122.0839;
  const hz = opts.sampleHz ?? 1;
  const accuracy = opts.accuracyMeters ?? 5;
  const jitter = opts.jitterMeters ?? 0;
  const dtSec = 1 / hz;

  const degPerMLon = 1 / (METERS_PER_DEG_LAT * Math.cos((startLat * Math.PI) / 180));

  const fixes: GeoFix[] = [];
  let tSec = 0;
  let distM = 0;
  let i = 0; // deterministic pseudo-jitter index (no Math.random — keeps tests stable)

  for (const [durSec, paceSecPerMile] of segments) {
    const speed = paceSecPerMileToMps(paceSecPerMile); // m/s along the path
    const steps = Math.round(durSec * hz);
    for (let s = 0; s < steps; s++) {
      distM += speed * dtSec;
      const lat = startLat + (jitter ? Math.sin(i * 1.7) * jitter * DEG_PER_M_LAT : 0);
      const lon = startLon + distM * degPerMLon;
      fixes.push({
        latitude: lat,
        longitude: lon,
        accuracyMeters: accuracy,
        timestampMs: startTimeMs + Math.round((tSec + (s + 1) * dtSec) * 1000),
      });
      i++;
    }
    tSec += steps * dtSec;
  }
  return fixes;
}

/** Convenience: total expected distance (m) for a profile, ignoring jitter. */
export function profileDistanceMeters(segments: PaceSegment[]): number {
  let d = 0;
  for (const [durSec, paceSecPerMile] of segments) {
    d += paceSecPerMileToMps(paceSecPerMile) * durSec;
  }
  return d;
}

export { METERS_PER_MILE };
