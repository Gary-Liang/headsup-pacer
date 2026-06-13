import type { Cue } from '../PacerCore/types.js';

/**
 * The audio half of the cue layer (spec §6): a short open-ear tone on drift, a
 * spoken mile split. Open-ear audio is the secondary channel — the visual flash
 * is primary — so this stays minimal.
 *
 * Splits are "spoken" via short pre-recorded clips by default (assign per-mile
 * or a generic "mile" clip). A TextToSpeech module could synthesize the exact
 * split time instead; left as a hook (speakSplit) since TTS availability/cost on
 * Spectacles should be confirmed on-device (spec §8.5).
 */
@component
export class CueAudio extends BaseScriptComponent {
  @input audio!: AudioComponent;

  @input hotTone!: AudioTrackAsset; // "ease off" cue
  @input slowTone!: AudioTrackAsset; // "pick it up" cue
  @input splitTone!: AudioTrackAsset; // spoken/earcon split
  @input pauseTone!: AudioTrackAsset;

  playCue(cue: Cue): void {
    switch (cue.kind) {
      case 'driftHot':
        this.play(this.hotTone);
        break;
      case 'driftSlow':
        this.play(this.slowTone);
        break;
      case 'mileSplit':
        this.play(this.splitTone);
        this.speakSplit(cue.mile, cue.splitMs);
        break;
      case 'pausePrompt':
        this.play(this.pauseTone);
        break;
      case 'backInBand':
        break; // in-band is silent by design (spec §6)
    }
  }

  private play(track: AudioTrackAsset | undefined): void {
    if (!track) return;
    this.audio.audioTrack = track;
    this.audio.play(1);
  }

  /**
   * Hook for spoken splits ("Mile 5 — 7:58"). Wire a TextToSpeech module here if
   * confirmed available; otherwise the splitTone earcon above already fired.
   */
  private speakSplit(_mile: number, _splitMs: number): void {
    // intentionally empty in v1 — see class docstring
  }
}
