import { describe, it, expect } from 'vitest';
import { CueEngine } from '../src/cueEngine.js';
import type { Cue, PaceBand } from '../src/types.js';
import { METERS_PER_MILE } from '../src/units.js';

const BAND: PaceBand = { targetSecPerMile: 480, toleranceSec: 10 }; // 8:00 ± 10s

/** Feed a constant pace for `seconds` at 1 Hz starting at `startMs`. */
function feedPace(
  engine: CueEngine,
  band: PaceBand,
  pace: number | null,
  startMs: number,
  seconds: number,
): { cues: Cue[]; endMs: number } {
  const cues: Cue[] = [];
  let t = startMs;
  for (let i = 0; i < seconds; i++) {
    t += 1000;
    cues.push(
      ...engine.update(
        { timestampMs: t, paceSecPerMile: pace, distanceMeters: 0, movingMs: t - startMs },
        band,
      ),
    );
  }
  return { cues, endMs: t };
}

describe('CueEngine drift hysteresis', () => {
  it('does not fire before the out-hysteresis is satisfied', () => {
    const e = new CueEngine();
    const { cues } = feedPace(e, BAND, 460, 0, 14); // hot, but only 14s
    expect(cues).toHaveLength(0);
  });

  it('fires a hot cue after 15s sustained outside the band', () => {
    const e = new CueEngine();
    const { cues } = feedPace(e, BAND, 460, 0, 16); // 7:40/mi, 16s
    const hot = cues.filter((c) => c.kind === 'driftHot');
    expect(hot).toHaveLength(1);
    expect((hot[0] as Extract<Cue, { kind: 'driftHot' }>).deltaSec).toBeCloseTo(20, 0);
  });

  it('fires a slow cue for sustained slow pace', () => {
    const e = new CueEngine();
    const { cues } = feedPace(e, BAND, 540, 0, 16); // 9:00/mi
    const slow = cues.filter((c) => c.kind === 'driftSlow');
    expect(slow).toHaveLength(1);
    expect((slow[0] as Extract<Cue, { kind: 'driftSlow' }>).deltaSec).toBeCloseTo(-60, 0);
  });

  it('does not spam: one cue while drift persists', () => {
    const e = new CueEngine();
    const { cues } = feedPace(e, BAND, 460, 0, 60); // 60s hot
    expect(cues.filter((c) => c.kind === 'driftHot')).toHaveLength(1);
  });

  it('clears with back-in-band only after the in-hysteresis', () => {
    const e = new CueEngine();
    let t = feedPace(e, BAND, 460, 0, 16).endMs; // fire hot
    // Return to band for 9s — not enough to clear.
    const a = feedPace(e, BAND, 480, t, 9);
    expect(a.cues.filter((c) => c.kind === 'backInBand')).toHaveLength(0);
    t = a.endMs;
    // 2 more seconds → crosses 10s in-band.
    const b = feedPace(e, BAND, 480, t, 2);
    expect(b.cues.filter((c) => c.kind === 'backInBand')).toHaveLength(1);
  });

  it('resets the in-band timer if pace pops back out before clearing', () => {
    const e = new CueEngine();
    let t = feedPace(e, BAND, 460, 0, 16).endMs; // hot
    t = feedPace(e, BAND, 480, t, 8).endMs; // 8s in-band (not cleared)
    t = feedPace(e, BAND, 460, t, 3).endMs; // pop back hot briefly
    const back = feedPace(e, BAND, 480, t, 9); // 9s in-band again — still < 10
    expect(back.cues.filter((c) => c.kind === 'backInBand')).toHaveLength(0);
  });

  it('re-fires in the opposite direction after an over-correction', () => {
    const e = new CueEngine();
    let t = feedPace(e, BAND, 460, 0, 16).endMs; // hot fired
    // Overcorrect straight to slow (no time in band) for 16s.
    const slow = feedPace(e, BAND, 540, t, 16);
    expect(slow.cues.filter((c) => c.kind === 'driftSlow')).toHaveLength(1);
    // No spurious back-in-band, since pace never re-entered the band.
    expect(slow.cues.filter((c) => c.kind === 'backInBand')).toHaveLength(0);
  });

  it('never fires when pace is unknown (null)', () => {
    const e = new CueEngine();
    const { cues } = feedPace(e, BAND, null, 0, 60);
    expect(cues).toHaveLength(0);
  });
});

describe('CueEngine mile splits', () => {
  it('emits a split at each mile boundary with interpolated time', () => {
    const e = new CueEngine();
    const cues: Cue[] = [];
    // 8:00/mi exactly: 480s/mi. Step distance each second.
    const mps = METERS_PER_MILE / 480;
    let dist = 0;
    for (let i = 0; i <= 1000; i++) {
      const t = i * 1000;
      cues.push(
        ...e.update(
          { timestampMs: t, paceSecPerMile: 480, distanceMeters: dist, movingMs: t },
          BAND,
        ),
      );
      dist += mps;
    }
    const splits = cues.filter((c) => c.kind === 'mileSplit') as Extract<
      Cue,
      { kind: 'mileSplit' }
    >[];
    expect(splits.length).toBeGreaterThanOrEqual(2);
    expect(splits[0]!.mile).toBe(1);
    // First mile split time should be ~480s (interpolated, within a second).
    expect(splits[0]!.splitMs).toBeGreaterThan(479_000);
    expect(splits[0]!.splitMs).toBeLessThan(481_000);
    // Second mile cumulative ~960s.
    expect(splits[1]!.cumulativeMs).toBeGreaterThan(958_000);
    expect(splits[1]!.cumulativeMs).toBeLessThan(962_000);
  });
});
