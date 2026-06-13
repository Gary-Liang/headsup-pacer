import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGpx } from '../src/gpx.js';
import { GpsPaceSource } from '../src/gpsPaceSource.js';

const fixturePath = fileURLToPath(new URL('../fixtures/sample.gpx', import.meta.url));

describe('parseGpx', () => {
  it('parses track points with timestamps', () => {
    const fixes = parseGpx(readFileSync(fixturePath, 'utf8'));
    expect(fixes).toHaveLength(6);
    expect(fixes[0]!.latitude).toBeCloseTo(37.3861, 4);
    expect(fixes[0]!.longitude).toBeCloseTo(-122.0839, 4);
    expect(fixes[0]!.accuracyMeters).toBe(5);
    expect(fixes[1]!.timestampMs - fixes[0]!.timestampMs).toBe(1000);
  });

  it('returns fixes sorted by time', () => {
    const fixes = parseGpx(readFileSync(fixturePath, 'utf8'));
    for (let i = 1; i < fixes.length; i++) {
      expect(fixes[i]!.timestampMs).toBeGreaterThan(fixes[i - 1]!.timestampMs);
    }
  });

  it('feeds straight into the pace source', () => {
    const fixes = parseGpx(readFileSync(fixturePath, 'utf8'));
    const src = new GpsPaceSource();
    for (const f of fixes) src.addFix(f);
    expect(src.state.distanceMeters).toBeGreaterThan(0);
  });

  it('honors a custom default accuracy', () => {
    const fixes = parseGpx(readFileSync(fixturePath, 'utf8'), { defaultAccuracyMeters: 8 });
    expect(fixes[0]!.accuracyMeters).toBe(8);
  });

  it('ignores points without timestamps', () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat="1.0" lon="2.0"></trkpt>
      <trkpt lat="1.0" lon="2.001"><time>2026-06-12T14:00:01Z</time></trkpt>
    </trkseg></trk></gpx>`;
    expect(parseGpx(xml)).toHaveLength(1);
  });
});
