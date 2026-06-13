import type { PaceBand } from './types.js';
import { formatPace } from './units.js';

/**
 * Pre-run band picker logic (spec §3). The UI is platform-specific, but the
 * stepping/clamping rules live here so they're testable and identical across
 * ports.
 */

export const MIN_TARGET_SEC = 4 * 60; // 4:00/mi — elite ceiling
export const MAX_TARGET_SEC = 16 * 60; // 16:00/mi — easy-jog floor
export const TARGET_STEP_SEC = 5;
export const MIN_TOLERANCE_SEC = 5;
export const MAX_TOLERANCE_SEC = 60;
export const TOLERANCE_STEP_SEC = 5;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

const snap = (v: number, step: number): number => Math.round(v / step) * step;

export function makeBand(targetSecPerMile: number, toleranceSec: number): PaceBand {
  return {
    targetSecPerMile: clamp(
      snap(targetSecPerMile, TARGET_STEP_SEC),
      MIN_TARGET_SEC,
      MAX_TARGET_SEC,
    ),
    toleranceSec: clamp(
      snap(toleranceSec, TOLERANCE_STEP_SEC),
      MIN_TOLERANCE_SEC,
      MAX_TOLERANCE_SEC,
    ),
  };
}

export function adjustTarget(band: PaceBand, deltaSteps: number): PaceBand {
  return makeBand(
    band.targetSecPerMile + deltaSteps * TARGET_STEP_SEC,
    band.toleranceSec,
  );
}

export function adjustTolerance(band: PaceBand, deltaSteps: number): PaceBand {
  return makeBand(
    band.targetSecPerMile,
    band.toleranceSec + deltaSteps * TOLERANCE_STEP_SEC,
  );
}

export function bandEdges(band: PaceBand): { fastSecPerMile: number; slowSecPerMile: number } {
  return {
    fastSecPerMile: band.targetSecPerMile - band.toleranceSec,
    slowSecPerMile: band.targetSecPerMile + band.toleranceSec,
  };
}

/** Human-readable label, e.g. "8:00/mi ± 10s". */
export function describeBand(band: PaceBand): string {
  return `${formatPace(band.targetSecPerMile)}/mi ± ${band.toleranceSec}s`;
}
