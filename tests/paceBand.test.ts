import { describe, it, expect } from 'vitest';
import {
  makeBand,
  adjustTarget,
  adjustTolerance,
  bandEdges,
  describeBand,
  MIN_TARGET_SEC,
  MAX_TARGET_SEC,
  MAX_TOLERANCE_SEC,
  MIN_TOLERANCE_SEC,
} from '../src/paceBand.js';

describe('paceBand picker', () => {
  it('snaps target to the 5s grid and clamps to limits', () => {
    expect(makeBand(482, 10).targetSecPerMile).toBe(480);
    expect(makeBand(100, 10).targetSecPerMile).toBe(MIN_TARGET_SEC);
    expect(makeBand(9999, 10).targetSecPerMile).toBe(MAX_TARGET_SEC);
  });

  it('clamps tolerance', () => {
    expect(makeBand(480, 1).toleranceSec).toBe(MIN_TOLERANCE_SEC);
    expect(makeBand(480, 999).toleranceSec).toBe(MAX_TOLERANCE_SEC);
  });

  it('adjusts target and tolerance by steps', () => {
    const b = makeBand(480, 10);
    expect(adjustTarget(b, +2).targetSecPerMile).toBe(490);
    expect(adjustTarget(b, -1).targetSecPerMile).toBe(475);
    expect(adjustTolerance(b, +1).toleranceSec).toBe(15);
  });

  it('computes band edges (fast < target < slow)', () => {
    const { fastSecPerMile, slowSecPerMile } = bandEdges(makeBand(480, 10));
    expect(fastSecPerMile).toBe(470);
    expect(slowSecPerMile).toBe(490);
  });

  it('describes a band', () => {
    expect(describeBand(makeBand(480, 10))).toBe('8:00/mi ± 10s');
  });
});
