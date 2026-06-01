import type { CSSProperties } from "react";

// Caps the stagger so a list of 200 rows doesn't take 6 s to finish
// animating in. After the cap every later row inherits the same delay,
// keeping the perceived motion snappy.
const DEFAULT_STAGGER_CAP = 14;

/**
 * Returns an inline style with the `--stagger-index` custom property
 * consumed by `.fs-row-in` / `.fs-card-in` in `globals.css`.
 *
 * Use as `style={staggerStyle(index)}` on each rendered list child so
 * the row entrance animation cascades visually without per-element
 * keyframe definitions.
 */
export function staggerStyle(
  index: number,
  cap: number = DEFAULT_STAGGER_CAP,
): CSSProperties {
  const safe = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  return { ["--stagger-index" as string]: String(Math.min(safe, cap)) };
}
