import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoScrollMarquee } from "./AutoScrollMarquee";

/** Callbacks of the stubbed observers, so a resize can be simulated. */
const resizeCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** A touch event carrying the touches that are still on the screen. */
function touchEvent(
  type: string,
  touches: { target: EventTarget | null }[],
): Event {
  const event = new Event(type) as Event & {
    touches: { target: EventTarget | null }[];
  };
  event.touches = touches;
  return event;
}

describe("AutoScrollMarquee", () => {
  beforeEach(() => {
    resizeCallbacks.length = 0;
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
    // The row sits at the start of the middle range, so the centre of the
    // viewport is in copy 1, which is the accessible one.
    expect(copies[1]).not.toHaveAttribute("aria-hidden");
    expect(copies[0]).toHaveAttribute("aria-hidden", "true");
    expect(copies[2]).toHaveAttribute("aria-hidden", "true");
    expect(items[1].dataset.clone).toBe("false");
    expect(items[0].dataset.clone).toBe("true");
  });

  it("moves the accessible copy with the centre of the viewport", async () => {
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
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(300);

    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {({ index, isClone }) => (
          <span data-testid="item" data-index={index} data-clone={String(isClone)}>
            Item
          </span>
        )}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;

    // The row starts at the beginning of the middle range, so the centre of
    // the viewport is in copy 1.
    expect(container.querySelectorAll("[data-marquee-copy]")[1]).not.toHaveAttribute(
      "aria-hidden",
    );

    // A scroll moves the centre of the viewport into the next copy.
    await act(async () => {
      scroller.scrollLeft = 1900;
      scroller.dispatchEvent(new Event("scroll"));
    });

    expect(container.querySelectorAll("[data-marquee-copy]")[2]).not.toHaveAttribute(
      "aria-hidden",
    );
    expect(container.querySelectorAll("[data-marquee-copy]")[1]).toHaveAttribute(
      "aria-hidden",
      "true",
    );
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

  it("keeps a focused link in view and settles back when the focus leaves", async () => {
    // jsdom has no :focus-visible heuristic, so stand in for a keyboard focus.
    const originalMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ":focus-visible") return true;
      return originalMatches.call(this, selector);
    });
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
        {() => <button type="button">Item</button>}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;
    const button = container.querySelector("button") as HTMLElement;

    // The browser scrolls the row back to the first copy to show the focused link.
    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 300));

    // The focused link must stay where the browser put it.
    expect(scroller.scrollLeft).toBe(120);

    // Once the focus leaves the row, it returns to the middle range.
    button.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1120);
  });

  it("keeps a focused link in view when the copy width changes", async () => {
    // jsdom has no :focus-visible heuristic, so stand in for a keyboard focus.
    const originalMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ":focus-visible") return true;
      return originalMatches.call(this, selector);
    });

    let copyWidth = 1000;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
      width: copyWidth,
      height: 100,
      top: 0,
      left: 0,
      right: copyWidth,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {() => <button type="button">Item</button>}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;
    const button = container.querySelector("button") as HTMLElement;

    // The browser scrolls the row back to the first copy to show the focused link.
    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    // A resize changes the width of a copy.
    copyWidth = 1500;
    await act(async () => {
      resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    });

    // The focused link must stay where the browser put it.
    expect(scroller.scrollLeft).toBe(120);

    // Once the focus leaves the row, it settles into the new middle range.
    button.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1620);
  });

  it("releases the keyboard pause when the focus is not keyboard visible", async () => {
    // Only the element marked as such counts as a keyboard focus.
    const originalMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ":focus-visible") return this.hasAttribute("data-keyboard");
      return originalMatches.call(this, selector);
    });
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
        {() => (
          <>
            <button type="button" data-keyboard>
              Keyboard
            </button>
            <button type="button">Mouse</button>
          </>
        )}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;
    const [keyboardButton, mouseButton] = Array.from(container.querySelectorAll("button"));

    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));
    keyboardButton.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    // A mouse press moves the focus out of the keyboard.
    mouseButton.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1120);
  });

  it("does not settle while a finger is on the row", async () => {
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

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;

    scroller.dispatchEvent(touchEvent("touchstart", [{ target: scroller }]));
    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => setTimeout(resolve, 300));

    // The finger is still on the row, so the offset must not be normalised.
    expect(scroller.scrollLeft).toBe(120);

    // Once the touch ends, the row settles again.
    scroller.dispatchEvent(touchEvent("touchend", []));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1120);
  });

  it("keeps the touch state while another finger is still down", async () => {
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

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;

    scroller.dispatchEvent(
      touchEvent("touchstart", [{ target: scroller }, { target: scroller }]),
    );
    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));

    // One finger lifts while the other one is still dragging the row.
    scroller.dispatchEvent(touchEvent("touchend", [{ target: scroller }]));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(120);

    // The last finger lifts.
    scroller.dispatchEvent(touchEvent("touchend", []));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1120);
  });

  it("settles when the finger on the row lifts and another one is outside", async () => {
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

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;

    // One finger drags the row, another one is held somewhere else.
    scroller.dispatchEvent(
      touchEvent("touchstart", [{ target: scroller }, { target: document.body }]),
    );
    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));

    // The finger on the row lifts, the other one stays on the screen.
    scroller.dispatchEvent(touchEvent("touchend", [{ target: document.body }]));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1120);
  });

  it("releases a pointer that was pressed and released outside the row", async () => {
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

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;

    // The mouse is pressed on the row and released outside the window, so the
    // page never sees the pointerup.
    scroller.dispatchEvent(new MouseEvent("pointerdown", { buttons: 1 }));
    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => setTimeout(resolve, 300));

    // The pressed pointer holds the row, so the offset is not normalised.
    expect(scroller.scrollLeft).toBe(120);

    // The pointer comes back without a button pressed.
    scroller.dispatchEvent(new MouseEvent("pointerleave", { buttons: 0 }));
    scroller.scrollLeft = 130;
    scroller.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1130);
  });

  it("releases the keyboard pause when the accessible copy is removed", async () => {
    // jsdom has no :focus-visible heuristic, so stand in for a keyboard focus.
    const originalMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ":focus-visible") return true;
      return originalMatches.call(this, selector);
    });
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

    const items = () => <button type="button">Item</button>;
    const { container, rerender } = render(
      <AutoScrollMarquee autoScroll>{items}</AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;
    const accessibleCopy = container.querySelectorAll("[data-marquee-copy]")[1];
    const button = accessibleCopy.querySelector("button") as HTMLElement;

    // The keyboard focus is inside the accessible copy.
    button.focus();

    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The focus holds the row, so the offset is not normalised.
    expect(scroller.scrollLeft).toBe(120);

    // The row stops animating, which removes the accessible copy, and starts
    // again. The focus is gone, so the row must not stay paused.
    rerender(<AutoScrollMarquee autoScroll={false}>{items}</AutoScrollMarquee>);
    rerender(<AutoScrollMarquee autoScroll>{items}</AutoScrollMarquee>);

    scroller.scrollLeft = 130;
    scroller.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(scroller.scrollLeft).toBe(1130);
  });

  it("releases the keyboard pause when a copy is removed by a resize", async () => {
    // jsdom has no :focus-visible heuristic, so stand in for a keyboard focus.
    const originalMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ":focus-visible") return true;
      return originalMatches.call(this, selector);
    });
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

    let viewport = 2000;
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => viewport);

    const { container } = render(
      <AutoScrollMarquee autoScroll>
        {() => <button type="button">Item</button>}
      </AutoScrollMarquee>,
    );

    const scroller = container.querySelector(".no-scrollbar") as HTMLElement;
    const copies = container.querySelectorAll("[data-marquee-copy]");
    expect(copies).toHaveLength(5);

    // The keyboard focus is inside the copy that the resize removes.
    const button = copies[4].querySelector("button") as HTMLElement;
    button.focus();

    scroller.scrollLeft = 120;
    scroller.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The focus holds the row, so the offset is not normalised.
    expect(scroller.scrollLeft).toBe(120);

    // Narrowing the viewport removes that copy.
    viewport = 1000;
    await act(async () => {
      resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    });

    expect(container.querySelectorAll("[data-marquee-copy]")).toHaveLength(4);

    scroller.scrollLeft = 130;
    scroller.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The focus is gone, so the row settles again.
    expect(scroller.scrollLeft).toBe(1130);
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
