# HeadsUp Pacer — core engine

> Run head-up. Your pace interrupts you — you never check it.

An interrupt-only pacing companion for runners on smart glasses. The display is
**dark by default**; a cue fires only on *sustained* drift outside your target
pace band (and at mile splits); a pinch wakes a full glance panel for a few
seconds, then back to dark.

This repo is the **platform-agnostic core** — the pace math, cue logic, and
session state machine — with no Lens Studio / Spectacles dependencies, so it
runs in plain Node for tests and unchanged inside the Spectacles JS runtime (and
later Meta DAT / Android XR). The product design is in [`DESIGN.md`](./DESIGN.md).

## What's implemented

The `$0`, no-hardware slice of the build sequence (spec §9, weekends 1–2 — the
"unit-testable TS modules"):

| Module | Spec | What it does |
|---|---|---|
| `PaceSource` (`paceSource.ts`) | §4 | Pluggable pace interface. v1 = GPS; v1.5 = BLE footpod (RSC) / broadcast HR; v2+ = Garmin Connect IQ bridge. |
| `GpsPaceSource` (`gpsPaceSource.ts`) | §5 | Accuracy gate (20 m), teleport rejection, cumulative haversine distance, **net-displacement** 30 s pace window, speed EMA for pause detection. |
| `CueEngine` (`cueEngine.ts`) | §5/§6 | Drift hysteresis (15 s out to fire, 10 s in to clear), hot/slow cues, mile splits with interpolated crossing times. |
| `Session` (`session.ts`) | §3 | State machine (idle→running→paused→stopped), moving-time accounting, auto-pause detection, glance-panel snapshot + projected finish. |
| `paceBand.ts` | §3 | Pre-run band picker logic — stepping, clamping, labels. |
| `gpx.ts` / `synth.ts` | §5 | GPX fixture parser + synthetic fix generator for replayed-run testing in the simulator. |
| `replay.ts` | §9 | CLI that runs a full simulated run end-to-end and prints the cue timeline + a display-on-time budget check. |

**Lens layer** lives in [`lens/`](./lens) — Spectacles adapter scripts (location
→ `Session`, SIK pinch → controls, `Cue` → display/audio, Endurance Mode, glance
panel, band picker). They consume this core through its `Session` / `Cue`
surface and compile inside Lens Studio (not this repo's Node `tsc`). See
[`lens/README.md`](./lens/README.md). Run `npm run sync:lens` to drop the core
into `lens/PacerCore/`.

**Still hardware-bound** (spec §8/§9 weekend 4): on-device GPS/thermal/legibility
spikes and distribution — these need the dev sub.

## Design note: why net-displacement pace

The product lives or dies on **not crying wolf** (spec §6: < ~2 min display-on
per hour). Per-fix GPS jitter is lateral and roughly zero-mean, so averaging
per-sample speeds inflates pace one-sidedly and fires false "hot" cues. Instead,
windowed pace is the straight-line displacement between the oldest and newest
fix in the 30 s window over their time span — the zig-zag cancels. Distance and
splits still use full haversine path length (raw distance is mildly
jitter-inflated; de-jittering is future work, and spec §8.1 lists smoothing
quality as an on-device spike).

Auto-pause detection still uses a per-segment speed EMA, which heavy GPS
*wander while stationary* can mask (you look like you're still moving). That's a
known limitation parked for the on-device spike — the same net-displacement
treatment could be applied to pause speed if real runs show it matters.

## Usage

```bash
npm install
npm test          # 44 unit tests
npm run typecheck # strict tsc, no emit
npm run replay              # synthetic 8:00/mi run with drifts + a stop
npm run replay -- run.gpx   # replay a recorded GPX at 8:00/mi ± 10s
```

### As a library

```ts
import { Session, makeBand } from './src/index.js';

const session = new Session({ band: makeBand(480, 10), goalDistanceMeters: 5000 });
session.start(Date.now());

// Feed each GPS fix as it arrives; you get back any cues to surface.
const cues = session.onFix({ latitude, longitude, accuracyMeters, timestampMs });
for (const cue of cues) render(cue); // driftHot | driftSlow | backInBand | mileSplit | pausePrompt

// On pinch, wake the glance panel:
const { paceSecPerMile, distanceMeters, elapsedMs, projectedFinishMs } = session.glance(now);
```

All tuning constants (windows, hysteresis, thresholds) live in `src/config.ts`
so they can be swept during the on-device spikes (spec §8).

## License

MIT
