import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoScrollMarquee } from "./AutoScrollMarquee";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("AutoScrollMarquee", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a single copy when auto-scroll is off", () => {
    const { container } = render(
      <AutoScrollMarquee autoScroll={false}>
        {() => <span data-testid="item">Item</span>}
      </AutoScrollMarquee>,
    );

    expect(screen.getAllByTestId("item")).toHaveLength(1);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it("renders hidden clones of the items when auto-scroll is on", () => {
    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {({ index, isClone }) => (
          <span data-testid="item" data-index={index} data-clone={String(isClone)}>
            Item
          </span>
        )}
      </AutoScrollMarquee>,
    );

    const items = screen.getAllByTestId("item");
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.filter((item) => item.dataset.clone === "true")).toHaveLength(
      items.length - 1,
    );
    expect(items[0].dataset.index).toBe("0");

    const copies = container.querySelectorAll("[data-marquee-copy]");
    expect(copies).toHaveLength(items.length);
    expect(copies[0]).not.toHaveAttribute("aria-hidden");
    expect(copies[1]).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a single copy when the user prefers reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );

    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {() => <span data-testid="item">Item</span>}
      </AutoScrollMarquee>,
    );

    expect(screen.getAllByTestId("item")).toHaveLength(1);
    expect(container.querySelectorAll("[data-marquee-copy]")).toHaveLength(1);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it("survives a focus that is not keyboard visible", () => {
    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {() => <button type="button">Item</button>}
      </AutoScrollMarquee>,
    );

    const button = container.querySelector("button");
    expect(() =>
      button?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
    ).not.toThrow();
  });

  it("keeps a row that does not animate at the start of its copy", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 100,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {() => <span data-testid="item">Item</span>}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar");
    expect(container.querySelectorAll("[data-marquee-copy]")).toHaveLength(1);
    expect(scroller?.scrollLeft).toBe(0);
  });

  it("places a row that animates in the middle of the track", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 100,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {() => <span data-testid="item">Item</span>}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar");
    // One copy is 1000 px wide, so the row starts one copy into the track.
    expect(scroller?.scrollLeft).toBe(1000);
  });

  it("stops the animation loop when it unmounts", () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const { unmount } = render(
      <AutoScrollMarquee autoScroll>
        {() => <span data-testid="item">Item</span>}
      </AutoScrollMarquee>,
    );

    expect(() => unmount()).not.toThrow();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
