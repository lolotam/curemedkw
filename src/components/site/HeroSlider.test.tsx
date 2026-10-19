import { render, screen } from "@testing-library/react";
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

  it("sizes an image-only hero by the image ratio on phones and keeps the viewport height from md up", async () => {
    mocks.listSlidesForPage.mockResolvedValue(
      heroSlides.map((s) => ({ ...s, title_en: null })),
    );

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    await screen.findAllByAltText("Hero slide");
    const carousel = container.querySelector('section[aria-roledescription="carousel"]');
    expect(carousel).toHaveClass(
      "aspect-[var(--hero-aspect)]",
      "md:aspect-auto",
      "md:h-[calc(100dvh-4rem)]",
      "md:min-h-[480px]",
    );
    expect(carousel).not.toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");
    expect(carousel).toHaveAttribute("style", expect.stringContaining("--hero-aspect"));

    const [overlayDot, belowDot] = screen.getAllByRole("button", { name: "Go to slide 1" });
    expect(overlayDot.closest("section")).toBe(carousel);
    expect(overlayDot.closest(".hidden.md\\:block")).not.toBeNull();
    expect(belowDot.closest("section")).toBeNull();
    expect(belowDot.closest(".md\\:hidden")).not.toBeNull();
  });

  it("keeps the full viewport height on every screen when a slide has overlay text", async () => {
    mocks.listSlidesForPage.mockResolvedValue([
      { ...heroSlides[0], title_en: null },
      heroSlides[1],
    ]);

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    await screen.findByAltText("Hero two");
    const carousel = container.querySelector('section[aria-roledescription="carousel"]');
    expect(carousel).toHaveClass("h-[calc(100dvh-4rem)]", "min-h-[480px]");
    expect(carousel).not.toHaveClass("aspect-[var(--hero-aspect)]");
  });

  it("ignores overlay text written only for the other language", async () => {
    mocks.listSlidesForPage.mockResolvedValue(
      heroSlides.map((s) => ({ ...s, title_en: "  ", title_ar: "شريحة جديدة" })),
    );

    const { container } = render(<HeroSlider pageKey="kapiva" />);

    await screen.findAllByRole("img", { hidden: true });
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
