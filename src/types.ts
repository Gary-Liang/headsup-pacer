/**
 * Core domain types for the HeadsUp Pacer engine.
 *
 * Everything here is platform-agnostic: no Lens Studio, no Spectacles, no DOM.
 * The Lens layer adapts these to RawLocationModule fixes, SIK gestures, and the
 * Endurance Mode display. Keeping this boundary clean is what makes the port to
 * Meta DAT / Android XR a re-skin rather than a rewrite (spec §7).
 */

/** A single GPS reading. Pace is in seconds-per-mile throughout the domain. */
export interface GeoFix {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters (the "± radius"). Lower is better. */
  accuracyMeters: number;
  /** Monotonic-ish timestamp in milliseconds. */
  timestampMs: number;
}

/** Snapshot of the smoothed pace state, produced by a PaceSource. */
export interface PaceState {
  /** Rolling-window pace in seconds per mile, or null until enough data. */
  paceSecPerMile: number | null;
  /** Cumulative distance traveled this session, in meters. */
  distanceMeters: number;
  /** Most recent instantaneous speed estimate (m/s), or null until known. */
  speedMps: number | null;
}

/** A target pace band: stay within `targetSecPerMile ± toleranceSec`. */
export interface PaceBand {
  /** Center of the band, seconds per mile (e.g. 480 = 8:00/mi). */
  targetSecPerMile: number;
  /** Half-width of the band, seconds per mile (e.g. 10). */
  toleranceSec: number;
}

/**
 * A cue is the only thing the runner ever perceives. The whole product is the
 * discipline of emitting these rarely (spec §6: under ~2 min display-on per hour).
 */
export type Cue =
  | { kind: 'driftHot'; deltaSec: number; paceSecPerMile: number; timestampMs: number }
  | { kind: 'driftSlow'; deltaSec: number; paceSecPerMile: number; timestampMs: number }
  | { kind: 'backInBand'; timestampMs: number }
  | {
      kind: 'mileSplit';
      mile: number;
      splitMs: number;
      cumulativeMs: number;
      timestampMs: number;
    }
  | { kind: 'pausePrompt'; timestampMs: number };

export type CueKind = Cue['kind'];

/** The data shown when the runner pinches to wake the glance panel (spec §3). */
export interface GlanceSnapshot {
  paceSecPerMile: number | null;
  distanceMeters: number;
  elapsedMs: number;
  /** Projected finish time (ms of moving time) for the goal distance, if set. */
  projectedFinishMs: number | null;
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped';
