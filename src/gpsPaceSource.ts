import type { GeoFix, PaceState } from './types.js';
import type { FixDrivenPaceSource } from './paceSource.js';
import { DEFAULT_SMOOTHING, type SmoothingConfig } from './config.js';
import { haversineMeters, mpsToPaceSecPerMile, paceSecPerMileToMps } from './units.js';

interface PosSample {
  timestampMs: number;
  latitude: number;
  longitude: number;
}

/**
 * GPS pace source implementing the spec §5 smoothing pipeline:
 *  1. accuracy gate — drop fixes worse than maxAccuracyMeters,
 *  2. teleport gate — drop implied paces faster than humanly possible (GPS jumps),
 *  3. cumulative haversine distance on accepted fixes,
 *  4. a 30s rolling window from which pace is the *net displacement* between the
 *     window endpoints over their time span (not a mean of per-sample speeds).
 *  5. an EMA of instantaneous speed for pause detection.
 *
 * Why net displacement for pace: per-fix GPS jitter is lateral and roughly
 * zero-mean, so summing per-segment path lengths inflates speed one-sidedly and
 * fires false "hot" cues. Measuring straight-line progress between the oldest
 * and newest fix in the window cancels that zig-zag — the whole product depends
 * on NOT crying wolf (spec §6). Distance/splits still use full path length.
 *
 * The push model lowers the precision bar: we answer "inside the band,
 * sustained?", never "render a stable live number" — so a window-smoothed pace
 * that slightly underestimates on sharp bends is fine.
 */
export class GpsPaceSource implements FixDrivenPaceSource {
  private readonly cfg: SmoothingConfig;
  private last: GeoFix | null = null;
  private window: PosSample[] = [];
  private distance = 0;
  private speedEma: number | null = null;
  private readonly maxSpeedMps: number;

  constructor(cfg: Partial<SmoothingConfig> = {}) {
    this.cfg = { ...DEFAULT_SMOOTHING, ...cfg };
    // Faster pace = higher speed. minHumanPace (3:00) → max plausible speed.
    this.maxSpeedMps = paceSecPerMileToMps(this.cfg.minHumanPaceSecPerMile);
  }

  get state(): PaceState {
    return {
      paceSecPerMile: this.currentPace(),
      distanceMeters: this.distance,
      speedMps: this.speedEma,
    };
  }

  reset(): void {
    this.last = null;
    this.window = [];
    this.distance = 0;
    this.speedEma = null;
  }

  addFix(fix: GeoFix): boolean {
    // 1. Accuracy gate.
    if (fix.accuracyMeters > this.cfg.maxAccuracyMeters) return false;

    const prev = this.last;
    if (prev === null) {
      this.last = fix;
      this.pushWindow(fix);
      return true; // first fix establishes the origin; nothing to measure yet
    }

    const dtMs = fix.timestampMs - prev.timestampMs;
    if (dtMs <= 0) return false; // out-of-order or duplicate timestamp

    const dist = haversineMeters(prev, fix);
    const speedMps = dist / (dtMs / 1000);

    // 2. Teleport gate: faster than any human → GPS jump. Reject without
    //    advancing `last`, so the next fix is measured against the good point.
    if (speedMps > this.maxSpeedMps) return false;

    // Accepted as real movement.
    this.distance += dist; // 3. cumulative path distance
    this.last = fix;
    this.updateSpeedEma(speedMps, dtMs);
    this.pushWindow(fix); // 4. feed the rolling window
    return true;
  }

  private pushWindow(fix: GeoFix): void {
    this.window.push({
      timestampMs: fix.timestampMs,
      latitude: fix.latitude,
      longitude: fix.longitude,
    });
    const cutoff = fix.timestampMs - this.cfg.paceWindowMs;
    // Keep one sample older than the cutoff so the span covers the full window.
    while (this.window.length > 2 && this.window[1]!.timestampMs < cutoff) {
      this.window.shift();
    }
  }

  private updateSpeedEma(speedMps: number, dtMs: number): void {
    if (this.speedEma === null) {
      this.speedEma = speedMps;
      return;
    }
    const alpha = 1 - Math.exp(-dtMs / this.cfg.speedEmaTauMs);
    this.speedEma += alpha * (speedMps - this.speedEma);
  }

  private currentPace(): number | null {
    if (this.window.length < 2) return null;
    const oldest = this.window[0]!;
    const newest = this.window[this.window.length - 1]!;
    const spanMs = newest.timestampMs - oldest.timestampMs;
    if (spanMs < this.cfg.minPaceSpanMs) return null;
    const displacement = haversineMeters(oldest, newest);
    const speedMps = displacement / (spanMs / 1000);
    if (speedMps <= 0) return Infinity; // standing still
    return mpsToPaceSecPerMile(speedMps);
  }
}
