import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HeroLayoutModeCard } from "./HeroLayoutModeCard";

const mocks = vi.hoisted(() => ({
  layoutMode: "fit_viewport" as "fit_viewport" | "aspect_ratio",
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  useSiteSetting: () => ({ data: mocks.layoutMode }),
  useUpdateSiteSetting: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe("HeroLayoutModeCard", () => {
  beforeEach(() => {
    mocks.layoutMode = "fit_viewport";
    mocks.mutateAsync.mockReset();
    mocks.toast.mockReset();
  });

  it("saves the previous aspect-ratio hero mode globally", async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    render(<HeroLayoutModeCard />);

    fireEvent.click(screen.getByRole("button", { name: /previous aspect/i }));
    fireEvent.click(screen.getByRole("button", { name: /save layout/i }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        key: "hero_layout_mode",
        value: "aspect_ratio",
      });
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Hero layout saved" }));
  });
});
