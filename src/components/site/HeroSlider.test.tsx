import { fireEvent, render, screen } from "@testing-library/react";
import type { HeroSlide } from "@/lib/heroSlides";
import { HeroSlider } from "./HeroSlider";

const mocks = vi.hoisted(() => ({
  listSlidesForPage: vi.fn(),
  heroLayoutMode: undefined as "fit_viewport" | "aspect_ratio" | undefined,
}));

vi.mock("@/lib/heroSlides", () => ({
  listSlidesForPage: mocks.listSlidesForPage,
}));

vi.mock("@/lib/db", () => ({
  useSiteSetting: (key: string, fallback: unknown) => ({
    data: key === "hero_layout_mode" ? mocks.heroLayoutMode ?? fallback : fallback,
  }),
}));

const heroSlides: HeroSlide[] = [
  createHeroSlide({
    id: "hero-slide-1",
    page_key: "kapiva",
    media_url: "/hero-1.webp",
    title_en: "Hero one",
    sort_order: 1,
  }),
  createHeroSlide({
    id: "hero-slide-2",
    page_key: "kapiva",
    media_url: "/hero-2.webp",
    title_en: "Hero two",
    sort_order: 2,
  }),
];

function createHeroSlide(patch: Partial<HeroSlide>): HeroSlide {
  return {
    id: "hero-slide",
    page_key: "kapiva",
    media_url: "/hero.webp",
    media_type: "image",
    title_en: "Hero",
    title_ar: null,
    subtitle_en: null,
    subtitle_ar: null,
    cta_label_en: null,
    cta_label_ar: null,
    cta_href: null,
    sort_order: 1,
    is_active: true,
    overlay_opacity: 0,
    created_at: "2026-07-06T00:00:00.000Z",
    updated_at: "2026-07-06T00:00:00.000Z",
    font_family_en: "inherit",
    font_family_ar: "inherit",
    h1_font_size: 60,
    h2_font_size: 20,
    cta_font_size: 16,
    h1_animation: "none",
    h2_animation: "none",
    cta_animation: "none",
    text_position_x: 50,
    text_position_y: 50,
    text_align: "center",
    ...patch,
  };
}

/** Simulates the browser finishing a slide image download with the given intrinsic size. */
function finishImageLoad(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: height });
  fireEvent.load(img);
}

describe("HeroSlider", () => {
  beforeEach(() => {
    mocks.listSlidesForPage.mockResolvedValue(heroSlides);
    mocks.heroLayoutMode = undefined;
  });

  it("fits the hero in the visible viewport and shows full slide images", async () => {
    const { container } = render(<HeroSlider pageKey="kapiva" />);

    await screen.findByAltText("Hero one");
    const carousel = container.querySelector('section[aria-roledescription="carousel"]');
    expect(carousel).toBeInTheDocument();
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    expect(carousel).toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");
    expect(carousel).not.toHaveAttribute("style", expect.stringContaining("aspect-ratio"));

    const activeImage = screen.getByAltText("Hero one");
    expect(activeImage).toHaveClass("object-contain");

    const firstDot = screen.getByRole("button", { name: "Go to slide 1" });
    expect(firstDot.closest("section")).toBe(carousel);
  });

  it("keeps the viewport height until an image-only hero knows its image ratio, then fits the image on phones", async () => {
    mocks.listSlidesForPage.mockResolvedValue(
      heroSlides.map((s) => ({ ...s, title_en: null })),
    );

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    const images = await screen.findAllByAltText("Hero slide");
    const carousel = container.querySelector<HTMLElement>('section[aria-roledescription="carousel"]');
    expect(carousel).toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");

    images.forEach((img) => finishImageLoad(img as HTMLImageElement, 1672, 941));

    expect(carousel).toHaveClass(
      "aspect-[var(--hero-aspect)]",
      "md:aspect-auto",
      "md:h-[calc(100dvh-4rem)]",
      "md:min-h-[480px]",
    );
    expect(carousel).not.toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");
    expect(carousel?.style.getPropertyValue("--hero-aspect")).toBe(`${1672 / 941}`);

    const [overlayDot, belowDot] = screen.getAllByRole("button", { name: "Go to slide 1" });
    expect(overlayDot.closest("section")).toBe(carousel);
    expect(overlayDot.closest(".hidden.md\\:block")).not.toBeNull();
    expect(belowDot.closest("section")).toBeNull();
    expect(belowDot.closest(".md\\:hidden")).not.toBeNull();
  });

  it("sizes the phone hero by the tallest loaded image without the 4:5 floor", async () => {
    mocks.listSlidesForPage.mockResolvedValue(
      heroSlides.map((s) => ({ ...s, title_en: null })),
    );

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    const [wide, tall] = (await screen.findAllByAltText("Hero slide")) as HTMLImageElement[];
    const carousel = container.querySelector<HTMLElement>('section[aria-roledescription="carousel"]');
    finishImageLoad(wide, 1672, 941);
    expect(carousel?.style.getPropertyValue("--hero-aspect")).toBe(`${1672 / 941}`);

    finishImageLoad(tall, 900, 1600);
    expect(carousel?.style.getPropertyValue("--hero-aspect")).toBe(`${900 / 1600}`);
    expect(carousel).toHaveClass("max-h-[calc(100dvh-4rem)]", "md:max-h-none");
  });

  it("keeps the full viewport height on every screen when a slide has overlay text", async () => {
    mocks.listSlidesForPage.mockResolvedValue([
      { ...heroSlides[0], title_en: null },
      heroSlides[1],
    ]);

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    finishImageLoad((await screen.findByAltText("Hero two")) as HTMLImageElement, 1672, 941);
    const carousel = container.querySelector('section[aria-roledescription="carousel"]');
    expect(carousel).toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");
    expect(carousel).not.toHaveClass("aspect-[var(--hero-aspect)]");
  });

  it("ignores overlay text written only for the other language", async () => {
    mocks.listSlidesForPage.mockResolvedValue(
      heroSlides.map((s) => ({ ...s, title_en: "  ", title_ar: "شريحة جديدة" })),
    );

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    const images = await screen.findAllByRole("img", { hidden: true });
    images.forEach((img) => finishImageLoad(img as HTMLImageElement, 1672, 941));
    const carousel = container.querySelector('section[aria-roledescription="carousel"]');
    expect(carousel).toHaveClass("aspect-[var(--hero-aspect)]");
  });

  it("uses the previous aspect-ratio layout when selected globally", async () => {
    mocks.heroLayoutMode = "aspect_ratio";

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    await screen.findByAltText("Hero one");
    const carousel = container.querySelector('section[aria-roledescription="carousel"]');
    expect(carousel).toBeInTheDocument();
    expect(carousel).toHaveClass("relative", "w-full", "overflow-hidden");
    expect(carousel).not.toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");

    expect(screen.getByAltText("Hero one")).toHaveClass("object-cover");

    const firstDot = screen.getByRole("button", { name: "Go to slide 1" });
    expect(firstDot.closest("section")).not.toBe(carousel);
  });
});
