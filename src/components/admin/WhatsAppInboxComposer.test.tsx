import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppInboxComposer } from "./WhatsAppInboxComposer";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: { functions: { invoke } } }));

describe("WhatsApp replies", () => {
  beforeEach(() => invoke.mockReset());
  it("preserves a failed draft and its request identity, clearing only a confirmed send", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("network") })
      .mockResolvedValueOnce({ data: { success: true, data: { sent: true } }, error: null });
    render(<WhatsAppInboxComposer chatId="87000000-0000-4000-8000-000000000001" disabled={false} onSent={() => {}} />);
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, { target: { value: "Customer reply" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: "Enter" });
    await screen.findByRole("alert");
    expect(composer).toHaveValue("Customer reply");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(composer).toHaveValue(""));
    expect(invoke.mock.calls[0][1].body.requestId).toBe(invoke.mock.calls[1][1].body.requestId);
  });

  it("disables replies and attachments while disconnected", () => {
    render(<WhatsAppInboxComposer chatId="87000000-0000-4000-8000-000000000001" disabled onSent={() => {}} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Attach a file (10 MB max)" })).toBeDisabled();
  });
});
