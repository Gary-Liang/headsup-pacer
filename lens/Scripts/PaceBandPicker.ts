import type { PaceBand } from '../PacerCore/types.js';
import { makeBand, adjustTarget, adjustTolerance, describeBand } from '../PacerCore/paceBand.js';
import { Interactable } from 'SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable';
import { PacerController } from './PacerController';

/**
 * Pre-run band picker UI (spec §3). Four pinch-tappable buttons step the target
 * pace and tolerance; the label updates live. The stepping/clamping rules live
 * in PacerCore (paceBand.ts), so this component is purely wiring.
 *
 * Pinch a button → adjust band → "Start" hands the final band to the controller
 * and the picker hides itself.
 */
@component
export class PaceBandPicker extends BaseScriptComponent {
  @input controller!: PacerController;
  @input label!: Text;
  @input pickerRoot!: SceneObject;

  @input targetUpButton!: Interactable;
  @input targetDownButton!: Interactable;
  @input toleranceUpButton!: Interactable;
  @input toleranceDownButton!: Interactable;
  @input startButton!: Interactable;

  @input('int', '480') startTargetSecPerMile: number = 480;
  @input('int', '10') startToleranceSec: number = 10;

  private band!: PaceBand;

  onAwake(): void {
    this.createEvent('OnStartEvent').bind(() => this.onStart());
  }

  private onStart(): void {
    this.band = makeBand(this.startTargetSecPerMile, this.startToleranceSec);
    this.bind(this.targetUpButton, () => (this.band = adjustTarget(this.band, +1)));
    this.bind(this.targetDownButton, () => (this.band = adjustTarget(this.band, -1)));
    this.bind(this.toleranceUpButton, () => (this.band = adjustTolerance(this.band, +1)));
    this.bind(this.toleranceDownButton, () => (this.band = adjustTolerance(this.band, -1)));
    this.startButton.onInteractorTriggerEnd.add(() => this.commit());
    this.refresh();
  }

  /** Wrap a button so every tap applies `step` then refreshes the label. */
  private bind(button: Interactable, step: () => void): void {
    button.onInteractorTriggerEnd.add(() => {
      step();
      this.refresh();
    });
  }

  private refresh(): void {
    this.label.text = describeBand(this.band);
  }

  private commit(): void {
    this.controller.setBand(this.band.targetSecPerMile, this.band.toleranceSec);
    this.pickerRoot.enabled = false; // hide the picker
    this.controller.startSession();
  }
}
