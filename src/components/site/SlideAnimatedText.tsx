import * as React from "react";
import { animationClass } from "@/lib/slideAnimations";

interface Props {
  text: string;
  animation: string | null | undefined;
  /** Bumped to re-trigger animations (replay button + slide change). */
  playKey: number;
  className?: string;
  style?: React.CSSProperties;
  as?: "h1" | "p" | "span" | "div";
}

/**
 * Renders a piece of slide text with one of the 10 animations.
 * Typewriter is rendered as a CSS width animation with a blinking caret.
 */
export function SlideAnimatedText({ text, animation, playKey, className = "", style, as = "span" }: Props) {
  const Tag = as as any;
  if (!text) return null;

  if (animation === "typewriter") {
    // Approx 50ms per char, min 0.6s, max 4s
    const chars = Math.max(1, [...text].length);
    const duration = Math.min(4, Math.max(0.6, chars * 0.05));
    return (
      <Tag
        key={playKey}
        className={`slide-typewriter inline-block overflow-hidden whitespace-nowrap align-bottom ${className}`}
        style={{
          ...style,
          borderRight: "0.08em solid currentColor",
          width: "0",
          animation: `slide-typewriter-${chars} ${duration}s steps(${chars}, end) forwards, slide-caret-blink 0.8s step-end infinite`,
          maxWidth: "100%",
        }}
      >
        {/* Inject a unique keyframe so width animates from 0 to the natural width.
            We use ch units which approximate monospace width but work for any font. */}
        <style>{`@keyframes slide-typewriter-${chars} { from { width: 0; } to { width: ${chars}ch; } }`}</style>
        {text}
      </Tag>
    );
  }

  const cls = animationClass(animation);
  return (
    <Tag key={playKey} className={`${cls} ${className}`.trim()} style={style}>
      {text}
    </Tag>
  );
}