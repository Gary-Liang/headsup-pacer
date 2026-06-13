import { describe, it, expect } from 'vitest';
import { GpsPaceSource } from '../src/gpsPaceSource.js';
import { synthFixes, profileDistanceMeters } from '../src/synth.js';
import { METERS_PER_MILE } from '../src/units.js';
import type { GeoFix } from '../src/types.js';

describe('GpsPaceSource smoothing pipeline', () => {
  it('converges to the true steady pace', () => {
    const src = new GpsPaceSource();
    const fixes = synthFixes([[120, 480]]); // 2 min at 8:00/mi
    for (const f of fixes) src.addFix(f);
    expect(src.state.paceSecPerMile).toBeCloseTo(480, 0);
  });

  it('accumulates distance accurately (haversine, straight east)', () => {
    const src = new GpsPaceSource();
    const profile = [[300, 480]] as [number, number][];
    const fixes = synthFixes(profile);
    for (const f of fixes) src.addFix(f);
    const expected = profileDistanceMeters(profile);
    // Within 0.5% over a quarter mile.
    expect(Math.abs(src.state.distanceMeters - expected) / expected).toBeLessThan(0.005);
  });

  it('rejects fixes worse than the accuracy gate', () => {
    const src = new GpsPaceSource();
    const good = synthFixes([[5, 480]]);
    expect(src.addFix(good[0]!)).toBe(true);
    const bad: GeoFix = { ...good[1]!, accuracyMeters: 50 };
    expect(src.addFix(bad)).toBe(false);
  });

  it('rejects out-of-order timestamps', () => {
    const src = new GpsPaceSource();
    const fixes = synthFixes([[5, 480]]);
    src.addFix(fixes[0]!);
    src.addFix(fixes[1]!);
    const stale: GeoFix = { ...fixes[2]!, timestampMs: fixes[0]!.timestampMs - 1000 };
    expect(src.addFix(stale)).toBe(false);
  });

  it('rejects GPS teleports faster than human range', () => {
    const src = new GpsPaceSource();
    const base = synthFixes([[5, 480]]);
    src.addFix(base[0]!);
    // Jump ~500m in 1s → ~500 m/s, far beyond the 3:00/mi ceiling.
    const teleport: GeoFix = {
      ...base[1]!,
      longitude: base[0]!.longitude + 0.006, // ~530m east at this latitude
    };
    const distBefore = src.state.distanceMeters;
    expect(src.addFix(teleport)).toBe(false);
    expect(src.state.distanceMeters).toBe(distBefore);
  });

  it('reflects a sustained walk as a slow pace (so the cue engine can flag it)', () => {
    const src = new GpsPaceSource();
    const profile: [number, number][] = [
      [60, 480], // tempo
      [60, 25 * 60], // 25:00/mi walk
    ];
    const fixes = synthFixes(profile);
    for (const f of fixes) src.addFix(f);
    // Distance reflects both segments.
    expect(src.state.distanceMeters).toBeCloseTo(profileDistanceMeters(profile), -1);
    // After 30s the window holds only walk samples → pace reads ~25:00/mi.
    expect(src.state.paceSecPerMile).toBeGreaterThan(20 * 60);
  });

  it('reset clears all state', () => {
    const src = new GpsPaceSource();
    for (const f of synthFixes([[60, 480]])) src.addFix(f);
    src.reset();
    expect(src.state.distanceMeters).toBe(0);
    expect(src.state.paceSecPerMile).toBeNull();
    expect(src.state.speedMps).toBeNull();
  });

  it('exposes a smoothed instantaneous speed for pause detection', () => {
    const src = new GpsPaceSource();
    for (const f of synthFixes([[60, 480]])) src.addFix(f);
    expect(src.state.speedMps).toBeGreaterThan(2.5);
    expect(src.state.speedMps).toBeLessThan(4.5);
  });

  it('keeps pace near target under GPS jitter (net-displacement window cancels zig-zag)', () => {
    const noisy = new GpsPaceSource();
    for (const f of synthFixes([[300, 480]], { jitterMeters: 1.5 })) noisy.addFix(f);
    // The whole point of net-displacement smoothing: no false drift from jitter.
    const pace = noisy.state.paceSecPerMile!;
    expect(pace).toBeGreaterThan(470);
    expect(pace).toBeLessThan(495);
    // Distance is still raw haversine, so it inflates a little — a known v1 limit.
    const clean = new GpsPaceSource();
    for (const f of synthFixes([[300, 480]])) clean.addFix(f);
    const ratio = noisy.state.distanceMeters / clean.state.distanceMeters;
    expect(ratio).toBeGreaterThanOrEqual(1.0);
    expect(ratio).toBeLessThan(1.25);
    void METERS_PER_MILE;
  });
});
