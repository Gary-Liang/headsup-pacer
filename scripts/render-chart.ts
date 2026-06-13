/**
 * Renders a pace-vs-band chart (SVG) from a simulated run, so the README shows
 * what the engine actually does: pace tracking against the band, with a marker
 * wherever a cue fired. Pure engine output — no hand-drawn data.
 *
 *   npx tsx scripts/render-chart.ts   (or: npm run chart)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Session } from '../src/session.js';
import { makeBand } from '../src/paceBand.js';
import { synthFixes, type PaceSegment } from '../src/synth.js';
import { formatPace } from '../src/units.js';
import type { Cue } from '../src/types.js';

// A legible profile: on-pace → surge → settle → fade → recover (no extreme stop,
// so the y-axis stays readable). Cues fall out of the engine, not the script.
const PROFILE: PaceSegment[] = [
  [120, 480], // 8:00 on pace
  [60, 450], // 7:30 surge (hot)
  [120, 485], // settle
  [90, 540], // 9:00 fade (slow)
  [150, 478], // recover (crosses mile 1)
];

const band = makeBand(480, 10);
const fixes = synthFixes(PROFILE, { jitterMeters: 0.6 });
const session = new Session({ band });
const t0 = fixes[0]!.timestampMs;
session.start(t0);

const samples: { t: number; pace: number }[] = [];
const cues: { t: number; cue: Cue }[] = [];
for (const f of fixes) {
  const emitted = session.onFix(f);
  const t = (f.timestampMs - t0) / 1000;
  const pace = session.paceState.paceSecPerMile;
  if (pace !== null && isFinite(pace)) samples.push({ t, pace });
  for (const c of emitted) cues.push({ t, cue: c });
}

// --- chart geometry ---
const W = 920;
const H = 380;
const M = { l: 64, r: 24, t: 36, b: 48 };
const plotW = W - M.l - M.r;
const plotH = H - M.t - M.b;

const tMax = Math.ceil(samples[samples.length - 1]!.t / 60) * 60;
const PACE_MIN = 420; // 7:00 (fast, top)
const PACE_MAX = 600; // 10:00 (slow, bottom)

const x = (t: number): number => M.l + (t / tMax) * plotW;
const y = (p: number): number => {
  const clamped = Math.max(PACE_MIN, Math.min(PACE_MAX, p));
  return M.t + ((clamped - PACE_MIN) / (PACE_MAX - PACE_MIN)) * plotH;
};

const COLORS: Record<Cue['kind'], string> = {
  driftHot: '#f0a500',
  driftSlow: '#58a6ff',
  backInBand: '#3fb950',
  mileSplit: '#d2a8ff',
  pausePrompt: '#ff7b72',
};
const LABEL: Record<Cue['kind'], string> = {
  driftHot: 'hot',
  driftSlow: 'slow',
  backInBand: 'in band',
  mileSplit: 'mile',
  pausePrompt: 'pause',
};

const round = (n: number): string => n.toFixed(1);

// Y grid + labels every 30s/mi.
let yGrid = '';
for (let p = PACE_MIN; p <= PACE_MAX; p += 30) {
  const yy = y(p);
  yGrid += `<line x1="${M.l}" y1="${round(yy)}" x2="${W - M.r}" y2="${round(yy)}" stroke="#1c2530" stroke-width="1"/>`;
  yGrid += `<text x="${M.l - 10}" y="${round(yy + 4)}" fill="#7d8590" font-size="12" text-anchor="end">${formatPace(p)}</text>`;
}

// X grid + labels every minute.
let xGrid = '';
for (let t = 0; t <= tMax; t += 60) {
  const xx = x(t);
  xGrid += `<line x1="${round(xx)}" y1="${M.t}" x2="${round(xx)}" y2="${H - M.b}" stroke="#1c2530" stroke-width="1"/>`;
  xGrid += `<text x="${round(xx)}" y="${H - M.b + 18}" fill="#7d8590" font-size="12" text-anchor="middle">${t / 60}:00</text>`;
}

// Band shading + target line.
const bandRect = `<rect x="${M.l}" y="${round(y(470))}" width="${plotW}" height="${round(y(490) - y(470))}" fill="#3fb950" opacity="0.12"/>`;
const targetLine = `<line x1="${M.l}" y1="${round(y(480))}" x2="${W - M.r}" y2="${round(y(480))}" stroke="#3fb950" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.6"/>`;

// Pace line.
const path = samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${round(x(s.t))} ${round(y(s.pace))}`).join(' ');
const paceLine = `<path d="${path}" fill="none" stroke="#f0f6fc" stroke-width="2.5" stroke-linejoin="round"/>`;

// Cue markers.
let markers = '';
for (const { t, cue } of cues) {
  const c = COLORS[cue.kind];
  const xx = x(t);
  markers += `<line x1="${round(xx)}" y1="${M.t}" x2="${round(xx)}" y2="${H - M.b}" stroke="${c}" stroke-width="1" opacity="0.35"/>`;
  markers += `<circle cx="${round(xx)}" cy="${M.t + 8}" r="4.5" fill="${c}"/>`;
  markers += `<text x="${round(xx)}" y="${M.t - 6}" fill="${c}" font-size="11" text-anchor="middle">${LABEL[cue.kind]}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
  <rect width="${W}" height="${H}" fill="#0b0f14" rx="10"/>
  <text x="${M.l}" y="22" fill="#e6edf3" font-size="14">HeadsUp Pacer — simulated run @ 8:00/mi ± 10s (dashed = target, shaded = band)</text>
  ${yGrid}
  ${xGrid}
  ${bandRect}
  ${targetLine}
  ${markers}
  ${paceLine}
</svg>
`;

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'replay-chart.svg');
writeFileSync(outPath, svg);
console.log(`wrote ${outPath} (${samples.length} pace samples, ${cues.length} cues)`);
