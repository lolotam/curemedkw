/**
 * Pure helpers for the auto-scrolling marquee.
 *
 * A scroll container reports `scrollLeft` differently per writing direction:
 * LTR uses [0, max], RTL uses [-max, 0]. Everything here works on a logical
 * offset (0 at the start edge of the track, growing towards its end) so the
 * same maths drives both directions. No React and no DOM access, so the scroll
 * behaviour can be unit tested without a layout engine.
 */

/** Converts a `scrollLeft` value into the track's logical offset. */
export function toLogical(scrollLeft: number, isRtl: boolean): number {
  return isRtl ? -scrollLeft : scrollLeft;
}

/** Converts a logical offset into the `scrollLeft` value to assign. */
export function toPhysical(logical: number, isRtl: boolean): number {
  return isRtl ? -logical : logical;
}

/** Wraps a value into [0, period). */
function wrapIntoRange(value: number, period: number): number {
  if (period <= 0) return 0;
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/**
 * Moves a logical position by `delta` and wraps it back into [0, period).
 * The position stays a float so sub-pixel steps are not lost.
 */
export function advance(position: number, delta: number, period: number): number {
  if (period <= 0) return position;
  return wrapIntoRange(position + delta, period);
}

/**
 * Maps a position that came from the element back onto the track: the start
 * edge moves on to the period (the same pixels, so the user can keep scrolling
 * backwards) and anything past the period wraps forward.
 */
export function wrapManual(position: number, period: number): number {
  if (period <= 0) return position;
  if (position <= 0) return period;
  return wrapIntoRange(position, period);
}

/**
 * Number of copies the marquee has to render: enough to fill the viewport and
 * still leave one full copy of travel, so the wrap never shows a gap.
 */
export function copiesNeeded(clientWidth: number, copyWidth: number, enabled: boolean): number {
  if (!enabled) return 1;
  if (copyWidth <= 0) return 2;
  return Math.max(2, Math.ceil(clientWidth / copyWidth) + 1);
}
