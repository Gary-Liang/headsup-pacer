import { Session } from '../PacerCore/session.js';
import { makeBand } from '../PacerCore/paceBand.js';
import type { Cue, GeoFix } from '../PacerCore/types.js';
import { SIK } from 'SpectaclesInteractionKit.lspkg/SIK';
import { CueView } from './CueView';
import { CueAudio } from './CueAudio';

// Brings the Spectacles Location API into scope (spec §7).
require('LensStudio:RawLocationModule');

/**
 * The Lens-side orchestrator. Owns the platform-agnostic {@link Session} and
 * wires it to the three Spectacles surfaces:
 *
 *   GPS (RawLocationModule)  →  Session.onFix
 *   pinch (SIK)              →  start / glance
 *   Cue / GlanceSnapshot     →  CueView + CueAudio
 *
 * Everything pace-related lives in PacerCore (unit-tested in Node); this file is
 * only glue, so the port to Meta DAT / Android XR replaces these ~150 lines and
 * keeps the brain intact.
 *
 * NOTE: every timestamp uses a single clock — getTime()*1000 (ms since the Lens
 * started). We stamp each fix with the poll time rather than the GPS-provided
 * Date so the moving-time math never mixes clock domains; at 1 Hz the poll time
 * tracks the fix time closely enough for the push model (spec §5).
 */
@component
export class PacerController extends BaseScriptComponent {
  // --- Pre-run band (the PaceBandPicker can overwrite these before start) ---
  @input('int', '480') targetSecPerMile: number = 480; // 8:00/mi
  @input('int', '10') toleranceSec: number = 10;
  @input('float', '0') goalDistanceMeters: number = 0; // 0 ⇒ no projection

  @input cueView!: CueView;
  @input cueAudio!: CueAudio;

  private session!: Session;
  private locationService: any; // LocationService (typed via Lens ambient defs)
  private pollEvent!: DelayedCallbackEvent;

  onAwake(): void {
    this.createEvent('OnStartEvent').bind(() => this.onStart());
  }

  private nowMs(): number {
    return getTime() * 1000;
  }

  private onStart(): void {
    this.session = new Session({
      band: makeBand(this.targetSecPerMile, this.toleranceSec),
      goalDistanceMeters: this.goalDistanceMeters > 0 ? this.goalDistanceMeters : undefined,
    });

    this.setupLocation();
    this.setupPinch();
    this.cueView.goDark(); // Endurance Mode: nothing on screen until a cue (spec §3)
  }

  // --- GPS: poll at 1 Hz and feed the session ----------------------------

  private setupLocation(): void {
    this.locationService = GeoLocation.createLocationService();
    this.locationService.accuracy = GeoLocationAccuracy.Navigation;

    this.pollEvent = this.createEvent('DelayedCallbackEvent');
    this.pollEvent.bind(() => this.poll());
  }

  private startPolling(): void {
    this.pollEvent.reset(0); // fire immediately, then re-arm each tick
  }

  private poll(): void {
    if (this.session.state !== 'running') return;
    this.locationService.getCurrentPosition(
      (geo: GeoPosition) => this.onGeo(geo),
      (err: string) => print(`[pacer] location error: ${err}`),
    );
    this.pollEvent.reset(1.0); // 1 Hz (spec §5)
  }

  private onGeo(geo: GeoPosition): void {
    const fix: GeoFix = {
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracyMeters: geo.horizontalAccuracy,
      timestampMs: this.nowMs(),
    };
    const cues = this.session.onFix(fix);
    for (const cue of cues) this.dispatch(cue);
  }

  private dispatch(cue: Cue): void {
    this.cueView.showCue(cue);
    this.cueAudio.playCue(cue);
  }

  // --- Pinch: start when idle, glance while running ----------------------

  private setupPinch(): void {
    const handData = SIK.HandInputData;
    for (const side of ['left', 'right'] as const) {
      const hand = handData.getHand(side);
      hand.onPinchDown.add(() => this.onPinch());
    }
  }

  private onPinch(): void {
    const status = this.session.state;
    if (status === 'idle' || status === 'stopped') {
      this.startSession();
    } else if (status === 'running') {
      this.cueView.showGlance(this.session.glance(this.nowMs()));
    }
  }

  // --- Lifecycle (also callable from a PaceBandPicker / UI buttons) -------

  setBand(targetSecPerMile: number, toleranceSec: number): void {
    if (this.session.state === 'running') return; // lock the band mid-run
    this.session.band = makeBand(targetSecPerMile, toleranceSec);
  }

  startSession(): void {
    this.session.start(this.nowMs());
    this.startPolling();
    this.cueView.goDark();
  }

  pauseSession(): void {
    this.session.pause(this.nowMs());
  }

  resumeSession(): void {
    this.session.resume(this.nowMs());
    this.startPolling();
  }

  stopSession(): void {
    this.session.stop(this.nowMs());
    this.cueView.showGlance(this.session.glance(this.nowMs())); // final summary
  }
}
