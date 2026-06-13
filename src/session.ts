import type {
  Cue,
  GeoFix,
  GlanceSnapshot,
  PaceBand,
  PaceState,
  SessionStatus,
} from './types.js';
import type { FixDrivenPaceSource } from './paceSource.js';
import { GpsPaceSource } from './gpsPaceSource.js';
import { CueEngine } from './cueEngine.js';
import { DEFAULT_PAUSE, type PauseConfig } from './config.js';
import { metersToMiles } from './units.js';

export interface SessionOptions {
  band: PaceBand;
  /** Pace source; defaults to GPS. Swap for BLE footpod in v1.5 (spec §4). */
  source?: FixDrivenPaceSource;
  cueEngine?: CueEngine;
  pause?: Partial<PauseConfig>;
  /** Optional goal distance (meters) for the glance panel's projected finish. */
  goalDistanceMeters?: number;
}

/**
 * The session state machine (spec §3) and orchestrator. It owns the lifecycle
 * (idle → running → paused → stopped), accounts moving time (paused time is
 * excluded), routes fixes to the pace source, drives the cue engine, and runs
 * auto-pause detection.
 *
 * It is deliberately UI- and clock-free: the caller supplies every fix with its
 * own timestamp, so the same code runs against replayed GPX fixtures in the
 * simulator and against live RawLocationModule fixes on-device.
 */
export class Session {
  private readonly source: FixDrivenPaceSource;
  private readonly cues: CueEngine;
  private readonly pauseCfg: PauseConfig;

  band: PaceBand;
  goalDistanceMeters: number | null;

  private status: SessionStatus = 'idle';

  // Moving-time accounting (all in the caller's timestamp domain).
  private movingAccumMs = 0; // moving time banked before the current run segment
  private segmentStartMs: number | null = null; // start of the active running segment
  private lastTickMs: number | null = null;

  // Auto-pause detection.
  private belowThresholdSinceMs: number | null = null;
  private pausePromptPending = false;

  constructor(opts: SessionOptions) {
    this.band = opts.band;
    this.source = opts.source ?? new GpsPaceSource();
    this.cues = opts.cueEngine ?? new CueEngine();
    this.pauseCfg = { ...DEFAULT_PAUSE, ...opts.pause };
    this.goalDistanceMeters = opts.goalDistanceMeters ?? null;
  }

  get state(): SessionStatus {
    return this.status;
  }

  get paceState(): PaceState {
    return this.source.state;
  }

  /** Moving time so far (excludes paused intervals). */
  movingMs(nowMs?: number): number {
    if (this.status === 'running' && this.segmentStartMs !== null) {
      const ref = nowMs ?? this.lastTickMs ?? this.segmentStartMs;
      return this.movingAccumMs + Math.max(0, ref - this.segmentStartMs);
    }
    return this.movingAccumMs;
  }

  // --- Lifecycle transitions ---------------------------------------------

  start(atMs: number): void {
    if (this.status !== 'idle' && this.status !== 'stopped') return;
    this.source.reset();
    this.cues.reset();
    this.status = 'running';
    this.movingAccumMs = 0;
    this.segmentStartMs = atMs;
    this.lastTickMs = atMs;
    this.belowThresholdSinceMs = null;
    this.pausePromptPending = false;
  }

  pause(atMs: number): void {
    if (this.status !== 'running') return;
    this.movingAccumMs = this.movingMs(atMs);
    this.segmentStartMs = null;
    this.belowThresholdSinceMs = null;
    this.pausePromptPending = false;
    this.status = 'paused';
  }

  resume(atMs: number): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.segmentStartMs = atMs;
    this.lastTickMs = atMs;
    this.belowThresholdSinceMs = null;
  }

  stop(atMs: number): void {
    if (this.status === 'running') this.movingAccumMs = this.movingMs(atMs);
    this.segmentStartMs = null;
    this.status = 'stopped';
  }

  // --- Per-fix update ----------------------------------------------------

  /**
   * Feed a GPS fix. Returns the cues emitted as a result. No-op (returns []) if
   * the session isn't running.
   */
  onFix(fix: GeoFix): Cue[] {
    if (this.status !== 'running') return [];
    this.lastTickMs = fix.timestampMs;
    this.source.addFix(fix);

    const st = this.source.state;
    const cues = this.cues.update(
      {
        timestampMs: fix.timestampMs,
        paceSecPerMile: st.paceSecPerMile,
        distanceMeters: st.distanceMeters,
        movingMs: this.movingMs(fix.timestampMs),
      },
      this.band,
    );

    const pauseCue = this.detectPause(fix.timestampMs, st.speedMps);
    if (pauseCue) cues.push(pauseCue);
    return cues;
  }

  private detectPause(nowMs: number, speedMps: number | null): Cue | null {
    if (speedMps === null) return null;
    if (speedMps < this.pauseCfg.speedThresholdMps) {
      if (this.belowThresholdSinceMs === null) this.belowThresholdSinceMs = nowMs;
      const sustained = nowMs - this.belowThresholdSinceMs >= this.pauseCfg.durationMs;
      if (sustained && !this.pausePromptPending) {
        this.pausePromptPending = true;
        return { kind: 'pausePrompt', timestampMs: nowMs };
      }
    } else {
      this.belowThresholdSinceMs = null;
      this.pausePromptPending = false;
    }
    return null;
  }

  // --- Glance panel (spec §3) -------------------------------------------

  glance(nowMs?: number): GlanceSnapshot {
    const st = this.source.state;
    const elapsedMs = this.movingMs(nowMs);
    return {
      paceSecPerMile: st.paceSecPerMile,
      distanceMeters: st.distanceMeters,
      elapsedMs,
      projectedFinishMs: this.projectFinish(st, elapsedMs),
    };
  }

  private projectFinish(st: PaceState, elapsedMs: number): number | null {
    if (this.goalDistanceMeters === null || st.paceSecPerMile === null) return null;
    const remainingMeters = this.goalDistanceMeters - st.distanceMeters;
    if (remainingMeters <= 0) return elapsedMs;
    const remainingMs = metersToMiles(remainingMeters) * st.paceSecPerMile * 1000;
    return elapsedMs + remainingMs;
  }
}
