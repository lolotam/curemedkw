import { useEffect, useRef } from "react";

/**
 * Reveals an element when it scrolls into view by toggling the `is-visible`
 * class on it (and any descendant `.reveal` nodes when `descendants` is true).
 *
 * Respects `prefers-reduced-motion`: the CSS layer disables transforms/opacity
 * so content shows immediately regardless of JS, keeping things accessible.
 *
 * Usage:
 *   const ref = useScrollReveal<HTMLDivElement>();          // reveal the node itself
 *   const ref = useScrollReveal<HTMLDivElement>(true);      // reveal all .reveal inside
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  descendants = false,
  options?: IntersectionObserverInit,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = descendants
      ? Array.from(root.querySelectorAll<HTMLElement>(".reveal"))
      : [root];

    if (targets.length === 0) return;

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px", ...options },
    );

    targets.forEach((el) => {
      if (!el.classList.contains("is-visible")) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [descendants, options]);

  return ref;
}
