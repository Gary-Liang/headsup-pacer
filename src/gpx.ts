import type { GeoFix } from './types.js';

/**
 * Minimal GPX track-point parser for replay fixtures (spec §5: "record real GPX
 * from Garmin runs, replay as test fixtures"). GPX has no accuracy field, so a
 * default is applied — real captures pass the accuracy gate easily.
 *
 * Regex-based on purpose: no XML/DOM dependency, runs identically in Node tests
 * and in the Lens Studio JS runtime.
 */
export interface GpxParseOptions {
  /** Accuracy (m) to stamp on each point. Default 5 (typical good GPS). */
  defaultAccuracyMeters?: number;
}

const TRKPT_RE = /<trkpt\b[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
const TRKPT_SELFCLOSE_RE = /<trkpt\b[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*\/>/gi;
const TIME_RE = /<time>([^<]+)<\/time>/i;

export function parseGpx(xml: string, opts: GpxParseOptions = {}): GeoFix[] {
  const accuracy = opts.defaultAccuracyMeters ?? 5;
  const fixes: GeoFix[] = [];

  for (const m of xml.matchAll(TRKPT_RE)) {
    const lat = parseFloat(m[1]!);
    const lon = parseFloat(m[2]!);
    const body = m[3]!;
    const timeMatch = body.match(TIME_RE);
    if (!timeMatch) continue; // no timestamp → cannot compute pace; skip
    const ts = Date.parse(timeMatch[1]!);
    if (Number.isNaN(ts)) continue;
    fixes.push({ latitude: lat, longitude: lon, accuracyMeters: accuracy, timestampMs: ts });
  }

  // Self-closing <trkpt .../> points carry no <time>; only usable if every
  // point lacks time, which we don't support. They're ignored here by design.
  void TRKPT_SELFCLOSE_RE;

  fixes.sort((a, b) => a.timestampMs - b.timestampMs);
  return fixes;
}
