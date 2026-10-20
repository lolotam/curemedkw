import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { advance, toLogical, toPhysical } from "@/components/site/autoScrollMath";

interface AutoScrollMarqueeProps {
  /** Whether auto-scroll is enabled. When false, the strip is static but still
   *  freely scrollable manually by touch/wheel/drag. */
  autoScroll: boolean;
  /** Pixels per second. */
  speed?: number;
  /** Direction. "rtl" scrolls visually right-to-left of the duplicated track,
   *  matching the previous CSS marquee. */
  direction?: "ltr" | "rtl";
  /** Resume delay (ms) after user finishes interacting. */
  resumeDelay?: number;
  className?: string;
  innerClassName?: string;
  /** Pass already-duplicated children (e.g. [...items, ...items]) so the
   *  scroller can wrap seamlessly at the half-width boundary. */
  children: ReactNode;
}

/**
 * Horizontally scrolls duplicated content automatically while still allowing
 * the user to swipe/drag/scroll manually. Auto-scroll pauses on hover, touch,
 * and active scrolling, and resumes shortly after the user lets go.
 */
export function AutoScrollMarquee({
  autoScroll,
  speed = 40,
  direction = "ltr",
  resumeDelay = 1500,
  className,
  innerClassName,
  children,
}: AutoScrollMarqueeProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Logical (content-order) position of the scroller. It lives here at
  // sub-pixel precision because scrollLeft reads back whole pixels, so a
  // step worth less than half a pixel would be lost on every frame.
  const positionRef = useRef(0);
  // The logical value the scroller is known to hold, used to tell a user
  // scroll apart from the animation writing to scrollLeft.
  const lastWrittenRef = useRef(0);

  // Mutable interaction flags so the rAF loop stays stable.
  const stateRef = useRef({
    autoScroll,
    hovering: false,
    touching: false,
    pointerDown: false,
    userScrollingUntil: 0,
    resumeTimer: 0 as number | 0,
  });

  // Keep the latest autoScroll prop in the ref.
  useEffect(() => {
    stateRef.current.autoScroll = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    const el = scrollerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    let rafId = 0;
    let last = performance.now();

    // Initialize scroll position for RTL so we start at the duplicate boundary
    // and animate toward 0 (visually moves content to the right -> left in RTL).
    const initPosition = () => {
      const half = track.scrollWidth / 2;
      const isRtl = getComputedStyle(el).direction === "rtl";
      const position = direction === "rtl" ? half : 0;
      positionRef.current = position;
      lastWrittenRef.current = position;
      el.scrollLeft = toPhysical(position, isRtl);
    };
    initPosition();

    const tick = (now: number) => {
      // A stalled tab must not teleport the row when the next frame lands.
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = stateRef.current;
      const half = track.scrollWidth / 2;

      const interacting =
        !s.autoScroll ||
        s.hovering ||
        s.touching ||
        s.pointerDown ||
        now < s.userScrollingUntil ||
        half <= 0;

      if (!interacting) {
        const isRtl = getComputedStyle(el).direction === "rtl";
        const travel = direction === "rtl" ? -speed : speed;
        // The position is the source of truth: scrollLeft is written, never
        // read back, so a sub-pixel step is not swallowed by pixel snapping.
        const position = advance(positionRef.current, travel * dt, half);
        positionRef.current = position;
        lastWrittenRef.current = position;
        el.scrollLeft = toPhysical(position, isRtl);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const onPointerEnter = () => {
      stateRef.current.hovering = true;
    };
    const onPointerLeave = () => {
      stateRef.current.hovering = false;
      stateRef.current.pointerDown = false;
    };
    const onPointerDown = () => {
      stateRef.current.pointerDown = true;
    };
    const onPointerUp = () => {
      stateRef.current.pointerDown = false;
      stateRef.current.userScrollingUntil = performance.now() + resumeDelay;
    };
    const onTouchStart = () => {
      stateRef.current.touching = true;
      window.clearTimeout(stateRef.current.resumeTimer);
    };
    const onTouchEnd = () => {
      window.clearTimeout(stateRef.current.resumeTimer);
      stateRef.current.resumeTimer = window.setTimeout(() => {
        stateRef.current.touching = false;
      }, resumeDelay);
    };
    const onScroll = () => {
      // If scroll movement comes from user (wheel/drag), defer auto-scroll.
      const s = stateRef.current;
      const animationIdle =
        !s.autoScroll ||
        s.hovering ||
        s.touching ||
        s.pointerDown ||
        performance.now() < s.userScrollingUntil;
      if (s.hovering || s.touching || s.pointerDown) {
        s.userScrollingUntil = performance.now() + resumeDelay;
      }

      const half = track.scrollWidth / 2;
      if (half <= 0) return;

      const isRtl = getComputedStyle(el).direction === "rtl";
      const logical = toLogical(el.scrollLeft, isRtl);

      // While the animation is idle every scroll comes from the user; while it
      // animates, only a scroll that differs from what we wrote did.
      if (animationIdle || Math.abs(logical - lastWrittenRef.current) > 2) {
        positionRef.current = logical;
        lastWrittenRef.current = logical;
      }

      // Wrap manually to keep an infinite feel even during user scroll.
      // The wrap works on the logical position, so it behaves the same in
      // RTL, where scrollLeft counts down from 0 instead of up.
      const current = positionRef.current;
      let next = current;
      if (next >= half * 2 - 1) next -= half;
      else if (next <= 0) next += half;
      if (next !== current) {
        el.scrollLeft = toPhysical(next, isRtl);
        positionRef.current = next;
        lastWrittenRef.current = next;
      }
    };

    el.addEventListener("pointerenter", onPointerEnter);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(stateRef.current.resumeTimer);
      el.removeEventListener("pointerenter", onPointerEnter);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("scroll", onScroll);
    };
  }, [speed, direction, resumeDelay]);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "overflow-x-auto overflow-y-hidden no-scrollbar touch-pan-x",
        className,
      )}
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div ref={trackRef} className={cn("flex w-max", innerClassName)}>
        {children}
      </div>
    </div>
  );
}
