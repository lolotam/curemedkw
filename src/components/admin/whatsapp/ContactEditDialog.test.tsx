import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppContact } from "@/lib/whatsappInbox";
import { ContactEditDialog } from "./ContactEditDialog";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: { functions: { invoke } } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const contact = (overrides: Partial<WhatsAppContact>): WhatsAppContact => ({
  id: "contact-1", normalized_phone: null, remote_jid: "623456789012345@lid", display_name: "Pushname", business_name: "",
  email: "", notes: "", updated_at: "2026-11-06T10:00:00.000Z", ...overrides,
});

function renderDialog(value: WhatsAppContact, onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ContactEditDialog contact={value} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

describe("contact edit dialog", () => {
  beforeEach(() => { invoke.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });

  it("sends only the changed fields and attaches a typed Kuwaiti number with its country code", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { contact: {} } }, error: null });
    const onClose = renderDialog(contact({}));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Sara Ali " } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "5000 0088" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("whatsapp-inbox", { body: { action: "contact.update", contactId: "contact-1",
      patch: { display_name: "Sara Ali", phone: "96550000088" } } });
  });

  it("offers no number field for a contact that already has one", () => {
    renderDialog(contact({ normalized_phone: "96550000066", remote_jid: null }));
    expect(screen.queryByLabelText("Phone number")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it.each([
    ["phone_in_use", "This number already belongs to another conversation or contact."],
    ["invalid_phone", "Enter a valid number with the country code, for example 96550000000."],
    ["storage_unavailable", "Could not save the contact. Try again."],
  ])("explains a %s refusal and keeps the form open", async (code, explanation) => {
    invoke.mockResolvedValue({ data: { success: false, error: { code } }, error: null });
    const onClose = renderDialog(contact({}));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "96550000077" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(explanation));
    expect(onClose).not.toHaveBeenCalled();
  });
});
