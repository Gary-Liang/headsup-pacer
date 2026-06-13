/**
 * HeadsUp Pacer — platform-agnostic pacing core.
 *
 * Public surface consumed by the Lens layer (and any future Meta DAT / Android
 * XR port). Nothing in here touches Lens Studio, so it runs in plain Node for
 * tests and in the Spectacles JS runtime unchanged.
 */
export * from './types.js';
export * from './units.js';
export * from './config.js';
export * from './paceSource.js';
export { GpsPaceSource } from './gpsPaceSource.js';
export { CueEngine } from './cueEngine.js';
export { Session, type SessionOptions } from './session.js';
export * from './paceBand.js';
export { parseGpx, type GpxParseOptions } from './gpx.js';
export { synthFixes, profileDistanceMeters, type PaceSegment, type SynthOptions } from './synth.js';
