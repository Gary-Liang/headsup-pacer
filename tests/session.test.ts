import { describe, it, expect } from 'vitest';
import { Session } from '../src/session.js';
import { makeBand } from '../src/paceBand.js';
import { synthFixes } from '../src/synth.js';
import type { Cue } from '../src/types.js';

const band = makeBand(480, 10);

describe('Session lifecycle', () => {
  it('ignores fixes until started', () => {
    const s = new Session({ band });
    const fixes = synthFixes([[10, 480]]);
    expect(s.onFix(fixes[0]!)).toEqual([]);
    expect(s.state).toBe('idle');
  });

  it('accounts moving time and excludes paused intervals', () => {
    const s = new Session({ band });
    const fixes = synthFixes([[120, 480]], { startTimeMs: 0 });
    s.start(0);
    // Run 30s.
    for (const f of fixes.filter((f) => f.timestampMs <= 30_000)) s.onFix(f);
    s.pause(30_000);
    expect(s.state).toBe('paused');
    // 60s of (ignored) paused wall time.
    s.resume(90_000);
    // Run another 30s of fixes, shifted to post-resume timestamps.
    const more = synthFixes([[30, 480]], { startTimeMs: 90_000 });
    for (const f of more) s.onFix(f);
    const moving = s.movingMs(120_000);
    // ~60s moving, not 120s wall.
    expect(moving).toBeGreaterThan(58_000);
    expect(moving).toBeLessThan(62_000);
  });

  it('start() resets prior state', () => {
    const s = new Session({ band });
    s.start(0);
    for (const f of synthFixes([[60, 480]])) s.onFix(f);
    s.stop(60_000);
    s.start(100_000);
    expect(s.paceState.distanceMeters).toBe(0);
    expect(s.state).toBe('running');
  });

  it('produces drift cues on a drifting run', () => {
    const s = new Session({ band });
    const fixes = synthFixes([
      [60, 480], // on pace
      [60, 430], // 7:10/mi hot, sustained
    ]);
    s.start(fixes[0]!.timestampMs);
    const all: Cue[] = [];
    for (const f of fixes) all.push(...s.onFix(f));
    expect(all.some((c) => c.kind === 'driftHot')).toBe(true);
  });
});

describe('Session auto-pause detection', () => {
  it('emits a pause prompt after sustained near-stop', () => {
    const s = new Session({ band });
    const fixes = synthFixes([
      [60, 480], // running
      [20, 3000], // ~50:00/mi ≈ standing, for 20s
    ]);
    s.start(fixes[0]!.timestampMs);
    const all: Cue[] = [];
    for (const f of fixes) all.push(...s.onFix(f));
    const pauses = all.filter((c) => c.kind === 'pausePrompt');
    expect(pauses).toHaveLength(1);
  });

  it('does not prompt during normal running', () => {
    const s = new Session({ band });
    const fixes = synthFixes([[180, 480]]);
    s.start(fixes[0]!.timestampMs);
    const all: Cue[] = [];
    for (const f of fixes) all.push(...s.onFix(f));
    expect(all.some((c) => c.kind === 'pausePrompt')).toBe(false);
  });
});

describe('Session glance panel', () => {
  it('reports pace, distance, elapsed and projects a finish', () => {
    const s = new Session({ band, goalDistanceMeters: 5000 });
    const fixes = synthFixes([[120, 480]]);
    s.start(fixes[0]!.timestampMs);
    for (const f of fixes) s.onFix(f);
    const g = s.glance(fixes[fixes.length - 1]!.timestampMs);
    expect(g.paceSecPerMile).toBeCloseTo(480, 0);
    expect(g.distanceMeters).toBeGreaterThan(0);
    expect(g.elapsedMs).toBeGreaterThan(115_000);
    expect(g.projectedFinishMs).not.toBeNull();
    // 5K at 8:00/mi ≈ 1491s ≈ 24:51.
    expect(g.projectedFinishMs!).toBeGreaterThan(1_400_000);
    expect(g.projectedFinishMs!).toBeLessThan(1_600_000);
  });

  it('returns a null projection without a goal distance', () => {
    const s = new Session({ band });
    s.start(0);
    for (const f of synthFixes([[60, 480]])) s.onFix(f);
    expect(s.glance(60_000).projectedFinishMs).toBeNull();
  });
});
