# HeadsUp Pacer — design

*A heads-up pacing companion for runners on smart glasses.*

**One-liner:** Run head-up. Your pace interrupts you — you never check it.

---

## 1. Thesis

Watch-based pacing is a polling loop: the runner repeatedly decides when to
glance, breaking form and burning attention. Audio alerts (Garmin/Strava)
partially solve this but require earbuds and can't deliver instant
glance-on-demand detail.

HeadsUp Pacer inverts the model:

- **Dark by default.** Display off while the runner is in their target zone.
- **Push when it matters.** A cue fires only on sustained drift outside the
  target pace band, and at mile splits.
- **Pull without the wrist.** A pinch wakes a full glanceable panel for ~5 s,
  then back to dark.

Design conviction: runners want *less* data in front of their eyes, not a
floating watchface.

## 2. Who it's for

- Pace-conscious road runners who already invest in running tech (Strava subs,
  footpod owners, Garmin power users).
- **Beachhead: prescription-glasses-wearing runners.** A large share of adults
  use vision correction; runners who already wear Rx glasses run with something
  on their face, so a smart-glasses HUD adds zero new equipment burden. Daily-wear
  devices increasingly support Rx (Meta Ray-Ban Display, Even Realities G1,
  Spectacles inserts).
- **Not in scope:** casual joggers, trail/ultra (different GPS + terrain
  assumptions), track workouts (lap-based — a different product).

## 3. v1 scope

**In:**

| Feature | Notes |
|---|---|
| Session start/pause/stop | Pinch-driven. No accounts, signup, or pairing beyond OS requirements. |
| Target pace band | Set pre-run, e.g. 8:00/mi ± 10 s. |
| Drift cues | Fire only when outside the band, sustained ≥ ~15 s. Visual flash + short open-ear audio. |
| Mile splits | Auto-announce split time at each mile (audio + brief display wake). |
| Glance panel | On pinch: pace (rolling avg), distance, elapsed, projected finish. Auto-dark after ~5 s. |
| Endurance Mode | Display off between cues/glances — the battery-survival lever. |
| Big-text display | Bottom of FOV, ≤3 numbers, high contrast, legible at stride. |

**Out (deliberately):** run history, accounts, cloud sync, export, music,
notifications, social, route navigation, coaching/AI plans, heart rate (v1.5).

## 4. Sensor architecture — pluggable pace source

Pace is an interface, not an implementation. Three tiers:

```
PaceSource (interface)
 ├── v1   GpsPaceSource        — device GPS + smoothing (zero extra hardware)
 ├── v1.5 BlePaceSource (RSC)  — footpods (Stryd etc.) via standard BLE
 │        BleHrSource          — broadcast HR (standard BLE HR profile)
 └── v2+  GarminBridgeSource   — Connect IQ companion app, if demand shows
```

Key facts driving this design:

- Garmin watches do **not** broadcast pace over BLE — broadcast mode is HR-only.
  Watch pace requires a Connect IQ companion app (separate codebase; not v1).
- Footpods broadcast pace via the standard BLE Running Speed & Cadence (RSC)
  profile. Footpod pace beats GPS pace in accuracy and latency.
- Positioning: "your watch's heads-up display," not a watch replacement.

## 5. GPS smoothing (v1)

The push model lowers the precision bar: we answer "inside the band,
sustained?" — not "display a stable live number."

- Sample GPS at 1 Hz (Navigation accuracy).
- Reject outliers: drop fixes with horizontal accuracy worse than ~20 m; drop
  implied speeds faster than humanly possible (GPS teleports).
- Distance: cumulative haversine on accepted fixes.
- Pace: a 30 s rolling window, computed as **net displacement between the window
  endpoints over their time span** — not a mean of per-sample speeds. GPS jitter
  is lateral and ~zero-mean, so averaging per-segment path lengths inflates pace
  one-sidedly and fires false cues; measuring straight-line progress cancels the
  zig-zag. This directly serves the "don't cry wolf" goal.
- Hysteresis on cues: must be outside the band ≥ 15 s to fire; must return inside
  ≥ 10 s to clear. Prevents cue spam at band edges.
- Pause detection: speed below a stopped threshold for ≥ 10 s → auto-pause prompt.

Develop against simulated coordinate streams (record real GPX, replay as test
fixtures).

## 6. Cue design

| Event | Visual | Audio |
|---|---|---|
| Drift hot (too fast) | Brief amber text: "+7s hot" | Short tone + "ease off" |
| Drift slow | Brief blue text: "-9s slow" | Short tone + "pick it up" |
| Back in band | Nothing (or tiny green tick) | Nothing |
| Mile split | Wake 3 s: "Mile 5 — 7:58" | Spoken split |
| Glance (pinch) | Full panel 5 s | None |

Principles: never interrupt when in-band; one cue type per event; total
display-on time over a 60-min run should stay under ~2 minutes.

## 7. Stack

- **First target:** Snap Spectacles — Lens Studio, TypeScript, Spectacles
  Interaction Kit (gestures), Location API, Endurance Mode, BLE API (v1.5).
- **Backend:** none in v1.
- **Portability:** the pace math and cue logic are platform-agnostic
  (see [`src/`](./src)); the Lens-specific glue is isolated in [`lens/`](./lens),
  so porting to other daily-wear XR hardware is a re-skin, not a rewrite.

## 8. Open risks (validate on-device)

1. **GPS at running speed** — refresh rate, accuracy, smoothing quality.
2. **Thermal + battery, 45–60 min outdoors** with Endurance Mode. This kills the
   product if it fails.
3. **Display legibility** — early-morning vs. sunny midday (auto-tint behavior).
4. **Physical fit at tempo pace** — bounce, sweat, nose-pad slip.
5. **Sensor-data publishing policy** — confirm current rules for Lenses using
   GPS/sensitive sensors before assuming open distribution.

## 9. Status

The platform-agnostic core (pace sources, GPS smoothing, cue engine, session
state machine) is implemented and unit-tested in plain TypeScript — see the
[README](./README.md) to run the tests and the replay CLI. The Lens Studio
integration layer is scaffolded in [`lens/`](./lens) and awaits on-device
validation of the risks above.
