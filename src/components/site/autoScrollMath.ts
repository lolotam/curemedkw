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
 * Advances a logical position by `delta` and keeps it inside the middle range
 * [period, 2 * period). Living in the middle leaves a full copy of room before
 * either physical edge, so a swipe never runs into one of them. The position
 * stays a float so sub-pixel steps are not lost.
 */
export function advance(position: number, delta: number, period: number): number {
  if (period <= 0) return position;
  return period + wrapIntoRange(position - period + delta, period);
}

/**
 * Maps a position onto the middle range [period, 2 * period): one below the
 * range moves up by whole periods, one above it moves down. The result shows
 * the same pixels, because the copies repeat every period.
 */
export function normalizeToMiddle(position: number, period: number): number {
  if (period <= 0) return position;
  if (position < period) {
    const periods = Math.ceil((period - position) / period);
    return position + periods * period;
  }
  if (position >= 2 * period) {
    const periods = Math.floor((position - period) / period);
    return position - periods * period;
  }
  return position;
}

/**
 * Number of copies the marquee has to render: enough to fill the viewport and
 * to keep the middle range reachable, so the wrap never shows a gap.
 */
export function copiesNeeded(clientWidth: number, copyWidth: number, enabled: boolean): number {
  if (!enabled) return 1;
  if (copyWidth <= 0) return 3;
  return Math.max(3, Math.ceil(clientWidth / copyWidth) + 2);
}
