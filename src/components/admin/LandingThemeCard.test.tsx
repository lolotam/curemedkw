import { render, screen } from "@testing-library/react";
import { LandingThemeCard } from "@/components/admin/LandingThemeCard";
import { LANDING_THEMES } from "@/lib/landingThemes";

const GOLD = LANDING_THEMES[0];

function renderCard(theme: string) {
  return render(
    <LandingThemeCard
      theme={theme}
      assets={{}}
      brand="kapiva"
      productSlug="a-product"
      onThemeChange={() => {}}
      onAssetsChange={() => {}}
    />,
  );
}

describe("LandingThemeCard", () => {
  // The upload fields are the whole point of the card, and the requirement is
  // that they appear only once a theme is chosen.
  it("shows an upload field for every section once a theme is selected", () => {
    renderCard(GOLD.id);
    for (const section of GOLD.sections) {
      expect(screen.getByText(section.label)).toBeInTheDocument();
    }
  });

  it("hides the upload fields while the default layout is selected", () => {
    renderCard("");
    for (const section of GOLD.sections) {
      expect(screen.queryByText(section.label)).not.toBeInTheDocument();
    }
    expect(screen.getByText("Default product page")).toBeInTheDocument();
  });
});
