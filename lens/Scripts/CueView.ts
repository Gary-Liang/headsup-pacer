import type { Cue, GlanceSnapshot } from '../PacerCore/types.js';
import { formatPace, formatDuration, metersToMiles } from '../PacerCore/units.js';

/**
 * The visual half of the cue layer (spec §6). Implements "dark by default":
 * `hudRoot` and `glanceRoot` are disabled except during the brief window a cue
 * or glance is on screen, then auto-darkened. Keeping draw off between cues is
 * what makes the §3 Endurance Mode battery budget viable.
 *
 * Design rules enforced here: bottom of FOV, ≤3 numbers, high contrast, one cue
 * type at a time, total on-time under ~2 min/hr (spec §6).
 */
@component
export class CueView extends BaseScriptComponent {
  // Single big-text line for drift/split cues (bottom of FOV).
  @input hudRoot!: SceneObject;
  @input hudText!: Text;

  // Glance panel: pace / distance / elapsed / projected finish.
  @input glanceRoot!: SceneObject;
  @input glancePace!: Text;
  @input glanceDistance!: Text;
  @input glanceElapsed!: Text;
  @input glanceProjected!: Text;

  // Cue colors (spec §6: amber hot, blue slow, green in-band).
  @input('vec4', '{1,0.6,0,1}') hotColor: vec4 = new vec4(1, 0.6, 0, 1);
  @input('vec4', '{0.3,0.6,1,1}') slowColor: vec4 = new vec4(0.3, 0.6, 1, 1);
  @input('vec4', '{0.3,1,0.4,1}') inBandColor: vec4 = new vec4(0.3, 1, 0.4, 1);

  private darkenEvent!: DelayedCallbackEvent;
  private glanceDarkenEvent!: DelayedCallbackEvent;

  onAwake(): void {
    this.darkenEvent = this.createEvent('DelayedCallbackEvent');
    this.darkenEvent.bind(() => (this.hudRoot.enabled = false));
    this.glanceDarkenEvent = this.createEvent('DelayedCallbackEvent');
    this.glanceDarkenEvent.bind(() => (this.glanceRoot.enabled = false));
    this.goDark();
  }

  goDark(): void {
    this.hudRoot.enabled = false;
    this.glanceRoot.enabled = false;
  }

  showCue(cue: Cue): void {
    switch (cue.kind) {
      case 'driftHot':
        this.flash(`+${Math.round(cue.deltaSec)}s hot`, this.hotColor, 1.5);
        break;
      case 'driftSlow':
        this.flash(`${Math.round(cue.deltaSec)}s slow`, this.slowColor, 1.5);
        break;
      case 'backInBand':
        this.flash('✓', this.inBandColor, 0.8); // tiny green tick
        break;
      case 'mileSplit':
        this.flash(`Mile ${cue.mile}  ${formatDuration(cue.splitMs)}`, this.inBandColor, 3.0);
        break;
      case 'pausePrompt':
        this.flash('paused?', this.slowColor, 3.0);
        break;
    }
  }

  /** Wake the big-text line for `seconds`, then auto-dark. */
  private flash(text: string, color: vec4, seconds: number): void {
    this.hudText.text = text;
    this.hudText.textFill.color = color;
    this.hudRoot.enabled = true;
    this.darkenEvent.reset(seconds);
  }

  /** Show the full glance panel for ~5 s (spec §3), then auto-dark. */
  showGlance(g: GlanceSnapshot): void {
    this.glancePace.text = `${formatPace(g.paceSecPerMile)}/mi`;
    this.glanceDistance.text = `${metersToMiles(g.distanceMeters).toFixed(2)} mi`;
    this.glanceElapsed.text = formatDuration(g.elapsedMs);
    this.glanceProjected.text =
      g.projectedFinishMs !== null ? `→ ${formatDuration(g.projectedFinishMs)}` : '';
    this.glanceRoot.enabled = true;
    this.glanceDarkenEvent.reset(5.0);
  }
}
