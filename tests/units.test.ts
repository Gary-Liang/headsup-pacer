import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  mpsToPaceSecPerMile,
  paceSecPerMileToMps,
  metersToMiles,
  formatPace,
  formatDuration,
  METERS_PER_MILE,
} from '../src/units.js';

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    const p = { latitude: 37.0, longitude: -122.0 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it('matches a known one-degree-latitude distance (~111.2 km)', () => {
    const d = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
});

describe('pace/speed conversions', () => {
  it('round-trips', () => {
    const pace = 480; // 8:00/mi
    expect(mpsToPaceSecPerMile(paceSecPerMileToMps(pace))).toBeCloseTo(pace, 6);
  });

  it('8:00/mi is ~3.35 m/s', () => {
    expect(paceSecPerMileToMps(480)).toBeCloseTo(METERS_PER_MILE / 480, 6);
  });

  it('handles stopped/degenerate input', () => {
    expect(mpsToPaceSecPerMile(0)).toBe(Infinity);
    expect(paceSecPerMileToMps(0)).toBe(0);
    expect(paceSecPerMileToMps(Infinity)).toBe(0);
  });
});

describe('formatting', () => {
  it('formats pace', () => {
    expect(formatPace(480)).toBe('8:00');
    expect(formatPace(458)).toBe('7:38');
    expect(formatPace(null)).toBe('--:--');
    expect(formatPace(Infinity)).toBe('--:--');
  });

  it('formats duration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(95_000)).toBe('1:35');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });

  it('converts meters to miles', () => {
    expect(metersToMiles(METERS_PER_MILE)).toBeCloseTo(1, 6);
  });
});
