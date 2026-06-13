import type { Cue, PaceBand } from './types.js';
import { DEFAULT_CUE, MILE_METERS, type CueConfig } from './config.js';

interface Tick {
  timestampMs: number;
  /** Smoothed pace (sec/mi), or null when unknown (no cue can fire). */
  paceSecPerMile: number | null;
  /** Cumulative distance (m) — drives mile splits. */
  distanceMeters: number;
  /** Cumulative *moving* time (ms) — drives split-time math. */
  movingMs: number;
}

type Direction = 'hot' | 'slow';

/**
 * Turns a stream of pace/distance ticks into the rare cues the runner actually
 * sees. Two independent concerns:
 *
 *  - Drift hysteresis (spec §5/§6): a drift cue fires only after the pace has
 *    been outside the band continuously for `outHysteresisMs`, and "back in
 *    band" clears only after `inHysteresisMs` continuously inside. This kills
 *    cue spam at the band edges.
 *
 *  - Mile splits (spec §6): emitted as each mile boundary is crossed, with the
 *    crossing time linearly interpolated between the bracketing ticks so the
 *    split isn't quantized to the 1 Hz sample grid.
 */
export class CueEngine {
  private readonly cfg: CueConfig;

  // Drift state.
  private active = false;
  private activeDir: Direction | null = null;
  private driftDir: Direction | null = null;
  private driftSinceMs: number | null = null;
  private inBandSinceMs: number | null = null;

  // Split state.
  private lastMile = 0;
  private lastMileMovingMs = 0;
  private prevDistance = 0;
  private prevMovingMs = 0;
  private seenFirstTick = false;

  constructor(cfg: Partial<CueConfig> = {}) {
    this.cfg = { ...DEFAULT_CUE, ...cfg };
  }

  reset(): void {
    this.active = false;
    this.activeDir = null;
    this.driftDir = null;
    this.driftSinceMs = null;
    this.inBandSinceMs = null;
    this.lastMile = 0;
    this.lastMileMovingMs = 0;
    this.prevDistance = 0;
    this.prevMovingMs = 0;
    this.seenFirstTick = false;
  }

  /** Advance the engine one tick; returns any cues emitted this tick. */
  update(tick: Tick, band: PaceBand): Cue[] {
    const cues: Cue[] = [];
    this.updateSplits(tick, cues);
    this.updateDrift(tick, band, cues);
    return cues;
  }

  private classify(pace: number | null, band: PaceBand): Direction | null {
    if (pace === null) return null;
    const fast = band.targetSecPerMile - band.toleranceSec; // smaller sec/mi
    const slow = band.targetSecPerMile + band.toleranceSec; // larger sec/mi
    if (pace < fast) return 'hot';
    if (pace > slow) return 'slow';
    return null;
  }

  private updateDrift(tick: Tick, band: PaceBand, cues: Cue[]): void {
    const { timestampMs: now, paceSecPerMile: pace } = tick;
    const dir = this.classify(pace, band);

    if (dir !== null) {
      // Outside the band.
      this.inBandSinceMs = null;
      if (this.driftSinceMs === null || this.driftDir !== dir) {
        // Started drifting, or flipped from hot↔slow without passing through
        // the band: restart the sustain timer for the new direction.
        this.driftSinceMs = now;
        this.driftDir = dir;
      }
      const sustained = now - this.driftSinceMs >= this.cfg.outHysteresisMs;
      if (sustained && (!this.active || this.activeDir !== dir)) {
        this.active = true;
        this.activeDir = dir;
        const deltaSec = band.targetSecPerMile - pace!; // hot: +, slow: -
        cues.push(
          dir === 'hot'
            ? { kind: 'driftHot', deltaSec, paceSecPerMile: pace!, timestampMs: now }
            : { kind: 'driftSlow', deltaSec, paceSecPerMile: pace!, timestampMs: now },
        );
      }
    } else {
      // Inside the band.
      this.driftSinceMs = null;
      this.driftDir = null;
      if (this.active) {
        if (this.inBandSinceMs === null) this.inBandSinceMs = now;
        if (now - this.inBandSinceMs >= this.cfg.inHysteresisMs) {
          this.active = false;
          this.activeDir = null;
          this.inBandSinceMs = null;
          cues.push({ kind: 'backInBand', timestampMs: now });
        }
      }
    }
  }

  private updateSplits(tick: Tick, cues: Cue[]): void {
    if (!this.seenFirstTick) {
      this.seenFirstTick = true;
      this.prevDistance = tick.distanceMeters;
      this.prevMovingMs = tick.movingMs;
      return;
    }

    const d0 = this.prevDistance;
    const d1 = tick.distanceMeters;
    const t0 = this.prevMovingMs;
    const t1 = tick.movingMs;

    // Emit a split for every mile boundary crossed since the last tick.
    while (d1 >= (this.lastMile + 1) * MILE_METERS) {
      const boundary = (this.lastMile + 1) * MILE_METERS;
      // Linear interpolation of the crossing time within [d0,d1] → [t0,t1].
      const frac = d1 > d0 ? (boundary - d0) / (d1 - d0) : 1;
      const crossMovingMs = t0 + frac * (t1 - t0);
      const mile = this.lastMile + 1;
      const splitMs = crossMovingMs - this.lastMileMovingMs;
      cues.push({
        kind: 'mileSplit',
        mile,
        splitMs,
        cumulativeMs: crossMovingMs,
        timestampMs: tick.timestampMs,
      });
      this.lastMile = mile;
      this.lastMileMovingMs = crossMovingMs;
    }

    this.prevDistance = d1;
    this.prevMovingMs = t1;
  }
}
