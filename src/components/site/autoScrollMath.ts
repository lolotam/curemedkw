// Pure maths for the auto-scrolling marquee.
//
// A scroller reports its offset in physical pixels, and those pixels mean
// different things per direction: in LTR scrollLeft runs from 0 to
// scrollWidth - clientWidth, in RTL from 0 down to -(scrollWidth - clientWidth).
// These helpers translate between the physical value the DOM exposes and a
// logical, content-order position, so the animation logic does not have to
// know which direction the page is laid out in.
//
// Deliberately free of React and DOM access so the rules can be unit-tested
// directly.

/** Converts a physical scrollLeft into the logical (content-order) position. */
export function toLogical(scrollLeft: number, isRtl: boolean): number {
  return isRtl ? -scrollLeft : scrollLeft;
}

/** Converts a logical (content-order) position into the scrollLeft to write. */
export function toPhysical(logical: number, isRtl: boolean): number {
  return isRtl ? -logical : logical;
}

/** Advances a logical position by delta, wrapping it back into [0, period). */
export function advance(position: number, delta: number, period: number): number {
  if (period <= 0) return position;
  const next = (position + delta) % period;
  return next < 0 ? next + period : next;
}
