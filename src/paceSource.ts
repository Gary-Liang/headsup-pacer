import type { GeoFix, PaceState } from './types.js';

/**
 * Pace is an interface, not an implementation (spec §4). v1 is GPS; v1.5 adds a
 * BLE footpod source (RSC profile) and broadcast-HR; v2+ a Garmin Connect IQ
 * bridge. The rest of the engine only ever sees a PaceState, so swapping the
 * source is a one-line change at the session boundary.
 */
export interface PaceSource {
  /** Current smoothed pace/distance/speed snapshot. */
  readonly state: PaceState;
  /** Reset all accumulated state (new session). */
  reset(): void;
}

/** A PaceSource fed by discrete GPS fixes. */
export interface FixDrivenPaceSource extends PaceSource {
  /**
   * Feed a fix. Returns true if it was accepted into distance/pace, false if
   * rejected (bad accuracy, out-of-order, or GPS teleport).
   */
  addFix(fix: GeoFix): boolean;
}
