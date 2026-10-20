import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  advance,
  copiesNeeded,
  normalizeToMiddle,
  toLogical,
  toPhysical,
} from "./autoScrollMath";

/** Longest frame delta honoured, so a backgrounded tab does not jump the row. */
const MAX_FRAME_SECONDS = 0.1;

/** Scroll drift (px) that is still attributed to the marquee's own write. */
const OWN_WRITE_TOLERANCE = 2;

/** Delay (ms) after the last scroll event that marks a user scroll as settled. */
const SETTLE_DELAY_MS = 150;

/** Mutable state of the animation loop. */
interface MarqueeLoop {
  /** Logical offset of the row; kept inside [period, 2 * period) while animating. */
  position: number;
  /** Logical value the loop wrote last, used to recognise user scrolls. */
  lastWritten: number;
  /** Wrap period: the measured width of one copy of the items. */
  period: number;
  /** Whether the scroller currently scrolls right-to-left. */
  isRtl: boolean;
  /** Set when the writing direction changed, so the row can restart. */
  directionChanged: boolean;
  /** Whether the row may animate at all. */
  animating: boolean;
}

/** Interaction flags that pause the animation. */
interface MarqueeInteraction {
  hovering: boolean;
  touching: boolean;
  pointerDown: boolean;
  focused: boolean;
  /** Timestamp until which the animation stays paused. */
  pausedUntil: number;
}

/** Props of one rendered copy of the row's items. */
interface MarqueeCopy {
  /** Zero-based index of the copy. */
  index: number;
  /** True for every copy after the first one. */
  isClone: boolean;
}

interface AutoScrollMarqueeProps {
  /** Whether auto-scroll is enabled. When false the row is a plain, swipeable
   *  strip without duplicates and without a wrap. */
  autoScroll: boolean;
  /** Pixels per second. */
  speed?: number;
  /** Direction of travel along the row's logical axis: "ltr" advances the items
   *  in the order they are rendered, "rtl" runs them backwards. It is
   *  independent of the document's `dir`, which only decides how the browser
   *  reports `scrollLeft`. */
  direction?: "ltr" | "rtl";
  /** Resume delay (ms) after the user finishes interacting. */
  resumeDelay?: number;
  className?: string;
  innerClassName?: string;
  /** Renders one copy of the items; the marquee duplicates it as needed. */
  children: (copy: MarqueeCopy) => ReactNode;
}

/** True when the row must not animate because the user is interacting with it. */
function isPaused(interaction: MarqueeInteraction, now: number): boolean {
  return (
    interaction.hovering ||
    interaction.touching ||
    interaction.pointerDown ||
    interaction.focused ||
    now < interaction.pausedUntil
  );
}

/** True when the scroller scrolls right-to-left. */
function readDirection(el: HTMLElement): boolean {
  return window.getComputedStyle(el).direction === "rtl";
}

/**
 * Reads the scroller's writing direction and remembers it, so every later
 * read and write uses the same direction. Reports whether it changed.
 */
function syncDirection(scroller: HTMLElement, loop: MarqueeLoop): boolean {
  const isRtl = readDirection(scroller);
  if (isRtl === loop.isRtl) return false;
  loop.isRtl = isRtl;
  loop.directionChanged = true;
  return true;
}

/** The place inside a copy, as a fraction of the copy's width. */
function placeInCopy(position: number, period: number): number {
  return (((position % period) + period) % period) / period;
}

/** Writes a logical offset to the scroller and remembers it as our own write. */
function writePosition(scroller: HTMLElement, loop: MarqueeLoop, logical: number): void {
  scroller.scrollLeft = toPhysical(logical, loop.isRtl);
  loop.lastWritten = logical;
}

/** What {@link bindInteractions} needs to wire the pause behaviour. */
interface InteractionBindings {
  scroller: HTMLElement;
  interaction: MarqueeInteraction;
  resumeDelay: number;
  /** Called when the keyboard focus leaves the row. */
  onFocusLeave: () => void;
}

/**
 * Wires the pointer, touch and focus listeners that pause the row while the
 * user is interacting with it. Returns the cleanup for those listeners.
 */
function bindInteractions(bindings: InteractionBindings): () => void {
  const { scroller, interaction, resumeDelay, onFocusLeave } = bindings;
  let resumeTimer = 0;

  const onPointerEnter = (event: PointerEvent) => {
    // A touch pointer enters the row too; only a mouse may pause it.
    if (event.pointerType !== "mouse") return;
    interaction.hovering = true;
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    interaction.hovering = false;
  };

  const onPointerDown = () => {
    interaction.pointerDown = true;
  };

  const onPointerRelease = () => {
    if (!interaction.pointerDown) return;
    interaction.pointerDown = false;
    interaction.pausedUntil = performance.now() + resumeDelay;
  };

  const onTouchStart = () => {
    interaction.touching = true;
    window.clearTimeout(resumeTimer);
  };

  const onTouchEnd = () => {
    interaction.pausedUntil = performance.now() + resumeDelay;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      interaction.touching = false;
    }, resumeDelay);
  };

  const onFocusIn = (event: FocusEvent) => {
    // A mouse press focuses a link as well, and the link keeps the focus
    // afterwards; only a keyboard focus may pause the row.
    const target = event.target as Element | null;
    if (!target) return;
    let keyboardVisible = false;
    try {
      keyboardVisible = target.matches(":focus-visible");
    } catch {
      keyboardVisible = false;
    }
    if (keyboardVisible) interaction.focused = true;
  };

  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && scroller.contains(next)) return;
    interaction.focused = false;
    interaction.pausedUntil = performance.now() + resumeDelay;
    // The row may now move the focused link out of the way.
    onFocusLeave();
  };

  scroller.addEventListener("pointerenter", onPointerEnter);
  scroller.addEventListener("pointerleave", onPointerLeave);
  scroller.addEventListener("pointerdown", onPointerDown);
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchend", onTouchEnd, { passive: true });
  scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
  scroller.addEventListener("focusin", onFocusIn);
  scroller.addEventListener("focusout", onFocusOut);
  window.addEventListener("pointerup", onPointerRelease);
  window.addEventListener("pointercancel", onPointerRelease);

  return () => {
    window.clearTimeout(resumeTimer);
    scroller.removeEventListener("pointerenter", onPointerEnter);
    scroller.removeEventListener("pointerleave", onPointerLeave);
    scroller.removeEventListener("pointerdown", onPointerDown);
    scroller.removeEventListener("touchstart", onTouchStart);
    scroller.removeEventListener("touchend", onTouchEnd);
    scroller.removeEventListener("touchcancel", onTouchEnd);
    scroller.removeEventListener("focusin", onFocusIn);
    scroller.removeEventListener("focusout", onFocusOut);
    window.removeEventListener("pointerup", onPointerRelease);
    window.removeEventListener("pointercancel", onPointerRelease);
  };
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
  const copyRef = useRef<HTMLDivElement>(null);

  const [reducedMotion, setReducedMotion] = useState(false);
  const [copyWidth, setCopyWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);

  const animating = autoScroll && !reducedMotion;

  const loopRef = useRef<MarqueeLoop>({
    position: 0,
    lastWritten: 0,
    period: 0,
    isRtl: false,
    directionChanged: false,
    animating,
  });

  const interactionRef = useRef<MarqueeInteraction>({
    hovering: false,
    touching: false,
    pointerDown: false,
    focused: false,
    pausedUntil: 0,
  });

  // The interactions live in their own effect, so they reach the settle
  // through a ref that always points at the current scheduler.
  const scheduleSettleRef = useRef<() => void>(() => {});

  useEffect(() => {
    const loop = loopRef.current;
    loop.animating = animating;

    const scroller = scrollerRef.current;
    if (!scroller || loop.period <= 0) return;

    if (!animating) {
      // The row is a plain strip now: show the remaining copy from its start.
      loop.position = 0;
      writePosition(scroller, loop, 0);
      return;
    }
    // The row starts animating: place it in the middle of the track.
    loop.position = loop.period * (1 + placeInCopy(loop.position, loop.period));
    writePosition(scroller, loop, loop.position);
  }, [animating]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const copy = copyRef.current;
    if (!scroller || !copy) return;

    const measure = () => {
      setCopyWidth(copy.getBoundingClientRect().width);
      setClientWidth(scroller.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const loop = loopRef.current;
    const previousPeriod = loop.period;
    loop.period = copyWidth;
    if (copyWidth <= 0) return;

    // A row that does not animate is a plain strip: leave it where it is.
    if (!loop.animating) return;

    if (previousPeriod <= 0) {
      // First measurement: start in the middle of the track.
      loop.position = copyWidth;
    } else {
      // Keep the same place inside the copy, so a resize does not jump the row.
      loop.position = copyWidth * (1 + placeInCopy(loop.position, previousPeriod));
    }

    const scroller = scrollerRef.current;
    if (scroller) writePosition(scroller, loop, loop.position);
  }, [copyWidth]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const interaction = interactionRef.current;

    let lastFrame = performance.now();
    let frameId = 0;
    let settleTimer = 0;

    const settlePosition = () => {
      // Never normalise while a pointer is down: the row is still being dragged.
      if (interaction.pointerDown) return;
      // A keyboard focus inside the row must stay visible, so the offset is
      // left alone until the focus leaves.
      if (interaction.focused) return;
      const loop = loopRef.current;
      if (!loop.animating || loop.period <= 0) return;
      const settled = normalizeToMiddle(loop.position, loop.period);
      if (settled === loop.position) return;
      loop.position = settled;
      writePosition(scroller, loop, settled);
    };

    const scheduleSettle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settlePosition, SETTLE_DELAY_MS);
    };

    scheduleSettleRef.current = scheduleSettle;

    const tick = (now: number) => {
      const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), MAX_FRAME_SECONDS);
      lastFrame = now;

      const loop = loopRef.current;
      if (loop.animating && loop.period > 0 && !isPaused(interaction, now)) {
        // The direction is only read on frames where the row actually advances.
        syncDirection(scroller, loop);
        if (loop.directionChanged) {
          // The document changed language: restart at the start of the range.
          loop.directionChanged = false;
          loop.position = loop.period;
        }
        const travel = direction === "ltr" ? speed : -speed;
        loop.position = advance(loop.position, travel * dt, loop.period);
        writePosition(scroller, loop, loop.position);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    const onScroll = () => {
      const loop = loopRef.current;
      // The direction is read before converting, so the offset is right even
      // right after the document switched language.
      syncDirection(scroller, loop);
      const logical = toLogical(scroller.scrollLeft, loop.isRtl);
      if (Math.abs(logical - loop.lastWritten) <= OWN_WRITE_TOLERANCE) return;

      // The user moved the row: the element wins over the animation. Nothing
      // is written back while the user scrolls, because a write during a fling
      // is dropped by mobile browsers.
      loop.position = logical;
      interaction.pausedUntil = performance.now() + resumeDelay;
      scheduleSettle();
    };

    const onScrollEnd = () => {
      window.clearTimeout(settleTimer);
      settlePosition();
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimer);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", onScrollEnd);
    };
  }, [speed, direction, resumeDelay]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    return bindInteractions({
      scroller,
      interaction: interactionRef.current,
      resumeDelay,
      onFocusLeave: () => scheduleSettleRef.current(),
    });
  }, [resumeDelay]);

  const copies = copiesNeeded(clientWidth, copyWidth, animating);

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
      <div className={cn("flex w-max", innerClassName)}>
        {Array.from({ length: copies }, (_, index) => (
          <div
            key={index}
            ref={index === 0 ? copyRef : undefined}
            data-marquee-copy={index}
            aria-hidden={index > 0 ? "true" : undefined}
            className="flex shrink-0"
          >
            {children({ index, isClone: index > 0 })}
          </div>
        ))}
      </div>
    </div>
  );
}
