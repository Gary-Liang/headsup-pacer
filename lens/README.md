# Lens layer — Spectacles integration

The Spectacles glue that turns the tested `../src` core into a wearable Lens.
**Reference scaffold:** these scripts target Lens Studio's ambient globals
(`@component`, `BaseScriptComponent`, `GeoLocation`, `SIK`, …) so they do **not**
compile in this repo's Node `tsc` — they compile *inside Lens Studio*. They live
outside the root `tsconfig.json` on purpose.

## Scripts

| Script | Role |
|---|---|
| `PacerController.ts` | Orchestrator. GPS → `Session.onFix`, pinch → start/glance, `Cue` → view + audio. Owns the single clock. |
| `CueView.ts` | Visual cues + glance panel. "Dark by default" Endurance Mode — roots disabled except during a flash. |
| `CueAudio.ts` | Open-ear tone on drift, earcon/spoken split. |
| `PaceBandPicker.ts` | Pre-run band picker UI (pinch buttons → `paceBand.ts` stepping). |
| `PacerCore/` | **Generated** copy of `../src` (run `npm run sync:lens`). Git-ignored; the core stays the single source of truth. |

## Setup

1. **Create the project.** Lens Studio 5.x, Spectacles project template.
2. **Add SIK.** Install the *Spectacles Interaction Kit* package (Asset Library).
   The imports use `SpectaclesInteractionKit.lspkg/...` — adjust the prefix if
   your install differs.
3. **Add the Location module.** `PacerController` calls
   `require('LensStudio:RawLocationModule')`; add the *Raw Location* module to
   the project and enable the Location capability in Project Settings →
   Extended Permissions.
4. **Bring in the code.** Run `npm run sync:lens` (repo root) to populate
   `lens/PacerCore/`, then add `lens/Scripts/` and `lens/PacerCore/` under your
   project's `Assets/`.
5. **Build the scene** (below) and assign the `@input` references in the
   Inspector.

> **Module resolution note.** The core uses ESM `.js`-extension imports
> (`./session.js`), which is valid TypeScript — Lens Studio resolves `.js` →
> `.ts`. If your Lens Studio version rejects the extensions, drop them in
> `PacerCore/` or bundle the core to a single module.

## Scene graph

```
PacerRig
├── Controller        → PacerController   (cueView, cueAudio, target, tolerance, goal)
├── HUD               → CueView.hudRoot   (bottom of FOV; disabled by default)
│   └── HudText       → CueView.hudText
├── GlancePanel       → CueView.glanceRoot (disabled by default)
│   ├── PaceText      → glancePace
│   ├── DistanceText  → glanceDistance
│   ├── ElapsedText   → glanceElapsed
│   └── ProjectedText → glanceProjected
├── Audio             → CueAudio.audio (AudioComponent) + 4 AudioTrackAssets
└── BandPicker        → PaceBandPicker (5 Interactable buttons + label)
```

## How it's wired (verified against current docs)

**Location (1 Hz polling, spec §5):**
```ts
require('LensStudio:RawLocationModule');
const loc = GeoLocation.createLocationService();
loc.accuracy = GeoLocationAccuracy.Navigation;        // FUSED_LOCATION
loc.getCurrentPosition(
  (geo) => { /* geo.latitude, geo.longitude, geo.horizontalAccuracy, geo.timestamp:Date */ },
  (err) => print(err),
);
```

**Pinch (SIK):**
```ts
import { SIK } from 'SpectaclesInteractionKit.lspkg/SIK';
const hand = SIK.HandInputData.getHand('right');
hand.onPinchDown.add(() => { /* glance / start */ });
```

**Clock.** Every timestamp is `getTime() * 1000` (ms since the Lens started),
including each GPS fix — stamped with the *poll* time, not the GPS `Date`. This
keeps the session's moving-time math in one clock domain; at 1 Hz the poll time
tracks the fix closely enough for the push model.

## Gesture scheme (v1 default)

- **Idle → pinch:** start the session (or use the Band Picker's Start button).
- **Running → pinch:** wake the glance panel for ~5 s, then dark.
- **Pause / stop:** bind `pauseSession()` / `stopSession()` to UI buttons or a
  held-pinch gesture — the controller exposes both as public methods.

## Still to verify on-device (spec §8)

- GPS refresh/accuracy at running speed; the smoother against real noise.
- Thermal + battery over 45–60 min with the display dark between cues.
- Display legibility (auto-tint) dawn vs. midday.
- TTS availability/cost for spoken splits (`CueAudio.speakSplit` is a hook).

## Sources

- [Location | Snap for Developers](https://developers.snap.com/spectacles/about-spectacles-features/apis/location)
- [LocationService | Lens Scripting API](https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.LocationService.html)
- [Hand Tracking — Spectacles Interaction Kit](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/handtracking)
