/**
 * Replay a run through the engine and print the cue timeline + summary.
 *
 *   npm run replay                 # synthetic 8:00/mi run with drifts
 *   npm run replay -- path/to.gpx  # replay a recorded GPX at 8:00/mi ± 10s
 *
 * This is the "full simulated run end-to-end" deliverable (spec §9, weekend 3),
 * and the engine behind the build-in-public demo footage.
 */
import { readFileSync } from 'node:fs';
import type { Cue, GeoFix } from './types.js';
import { Session } from './session.js';
import { makeBand, describeBand } from './paceBand.js';
import { parseGpx } from './gpx.js';
import { synthFixes, type PaceSegment } from './synth.js';
import { formatPace, formatDuration, metersToMiles } from './units.js';

function demoFixes(): GeoFix[] {
  // 8:00/mi target. Start on pace, surge hot, settle, fade slow, recover, stop.
  const profile: PaceSegment[] = [
    [120, 480], // 2 min on pace (8:00)
    [60, 450], // 1 min surge to 7:30 (hot)
    [120, 485], // 2 min back near pace
    [90, 540], // 1.5 min fade to 9:00 (slow)
    [120, 478], // 2 min recover
    [40, 3000], // 40 s near-stop (triggers pause prompt)
  ];
  return synthFixes(profile, { jitterMeters: 0.6 });
}

function describeCue(c: Cue): string {
  switch (c.kind) {
    case 'driftHot':
      return `🔥 HOT  +${Math.round(c.deltaSec)}s/mi  (${formatPace(c.paceSecPerMile)}/mi)  "ease off"`;
    case 'driftSlow':
      return `🐢 SLOW ${Math.round(c.deltaSec)}s/mi  (${formatPace(c.paceSecPerMile)}/mi)  "pick it up"`;
    case 'backInBand':
      return `✅ back in band`;
    case 'mileSplit':
      return `📍 Mile ${c.mile} — ${formatDuration(c.splitMs)} (cum ${formatDuration(c.cumulativeMs)})`;
    case 'pausePrompt':
      return `⏸  pause? (stopped)`;
  }
}

function main(): void {
  const path = process.argv[2];
  const fixes = path
    ? parseGpx(readFileSync(path, 'utf8'))
    : demoFixes();

  if (fixes.length === 0) {
    console.error('No fixes to replay.');
    process.exit(1);
  }

  const band = makeBand(480, 10); // 8:00/mi ± 10s
  const session = new Session({ band, goalDistanceMeters: 5000 });
  const t0 = fixes[0]!.timestampMs;
  session.start(t0);

  console.log(`HeadsUp Pacer — replay`);
  console.log(`Band: ${describeBand(band)}   Fixes: ${fixes.length}`);
  console.log('─'.repeat(56));

  let displayOnMs = 0;
  let cueCount = 0;
  for (const fix of fixes) {
    const cues = session.onFix(fix);
    for (const cue of cues) {
      cueCount++;
      // Rough display-on accounting for the §6 "<2 min/hr" budget check.
      displayOnMs += cue.kind === 'mileSplit' ? 3000 : cue.kind === 'pausePrompt' ? 0 : 1500;
      const at = formatDuration(fix.timestampMs - t0);
      console.log(`[${at}] ${describeCue(cue)}`);
    }
  }

  const last = fixes[fixes.length - 1]!;
  session.stop(last.timestampMs);
  const g = session.glance(last.timestampMs);

  console.log('─'.repeat(56));
  console.log(`Distance:   ${metersToMiles(g.distanceMeters).toFixed(2)} mi`);
  console.log(`Moving:     ${formatDuration(g.elapsedMs)}`);
  console.log(`Avg pace:   ${formatPace(g.paceSecPerMile)}/mi`);
  if (g.projectedFinishMs !== null) {
    console.log(`Proj 5K:    ${formatDuration(g.projectedFinishMs)}`);
  }
  const wallMs = last.timestampMs - t0;
  const onPerHr = wallMs > 0 ? (displayOnMs / wallMs) * 3600_000 : 0;
  console.log(`Cues:       ${cueCount}  (~${formatDuration(displayOnMs)} display-on, ~${formatDuration(onPerHr)}/hr — budget <2:00/hr)`);
}

main();
