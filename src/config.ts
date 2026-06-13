/**
 * Tunable constants, all in one place so they can be swept during on-device
 * spikes (spec §8) without hunting through logic. Values are the spec's defaults.
 */

import { METERS_PER_MILE } from './units.js';

/** GPS smoothing & acceptance (spec §5). */
export interface SmoothingConfig {
  /** Drop fixes with horizontal accuracy worse than this (meters). */
  maxAccuracyMeters: number;
  /** Rolling pace window length (ms). */
  paceWindowMs: number;
  /** Need at least this much window span before reporting a pace (ms). */
  minPaceSpanMs: number;
  /** Reject as GPS teleport if implied pace is faster than this (sec/mi). */
  minHumanPaceSecPerMile: number;
  /** Time constant (ms) for the instantaneous-speed EMA used by pause detection. */
  speedEmaTauMs: number;
}

export const DEFAULT_SMOOTHING: SmoothingConfig = {
  maxAccuracyMeters: 20,
  paceWindowMs: 30_000,
  minPaceSpanMs: 3_000,
  // 3:00/mi — the upper human-speed bound from spec §5; faster ⇒ GPS teleport.
  minHumanPaceSecPerMile: 3 * 60,
  speedEmaTauMs: 5_000,
};

/** Cue hysteresis & splits (spec §5/§6). */
export interface CueConfig {
  /** Must be outside the band continuously this long before a drift cue fires. */
  outHysteresisMs: number;
  /** Must be back inside the band continuously this long before "back in band". */
  inHysteresisMs: number;
}

export const DEFAULT_CUE: CueConfig = {
  outHysteresisMs: 15_000,
  inHysteresisMs: 10_000,
};

/** Auto-pause detection (spec §5). */
export interface PauseConfig {
  /** Below this speed (m/s) ... */
  speedThresholdMps: number;
  /** ... continuously for this long → emit a pause prompt. */
  durationMs: number;
}

export const DEFAULT_PAUSE: PauseConfig = {
  // ~1.0 m/s ≈ 26:50/mi: slower than any run, i.e. stopped or walking off the pace.
  speedThresholdMps: 1.0,
  durationMs: 10_000,
};

export const MILE_METERS = METERS_PER_MILE;
