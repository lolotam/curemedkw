import { useEffect, useState, type RefObject } from "react";

/**
 * Turns true the first time the element comes within 200px of the viewport, and stays true.
 *
 * Gates attachment fetches so opening a thread does not download every file in it. Without
 * IntersectionObserver (jsdom, old browsers) it reports visible at once so media still loads.
 */
export function useInViewOnce<T extends Element>(ref: RefObject<T | null>): boolean {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, visible]);

  return visible;
}
