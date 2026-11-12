import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderWhatsAppTab } from "./OrderWhatsAppTab";

const boundary = vi.hoisted(() => ({
  saved: null as unknown,
  rows: [] as unknown[],
  mutate: vi.fn(),
  from: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  useSiteSetting: () => ({ data: boundary.saved, isLoading: false }),
  useUpdateSiteSetting: () => ({ mutate: boundary.mutate, isPending: false }),
}));
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: { from: boundary.from } }));
vi.mock("sonner", () => ({ toast: { success: boundary.success, error: boundary.error } }));

describe("order WhatsApp tab", () => {
  const clients: QueryClient[] = [];
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.saved = null;
    boundary.rows = [];
    boundary.from.mockImplementation(() => ({
      select: () => ({ order: () => ({ limit: async () => ({ data: boundary.rows, error: null }) }) }),
    }));
  });
  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
  });

  function renderTab() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><OrderWhatsAppTab /></QueryClientProvider>);
  }

  it("saves only its own settings key, with the follow-up delay clamped to the server's range", async () => {
    boundary.mutate.mockImplementation((_vars, options) => options.onSuccess());
    renderTab();

    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
    fireEvent.change(screen.getByLabelText("Days after delivery"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save WhatsApp settings" }));

    expect(boundary.mutate).toHaveBeenCalledTimes(1);
    expect(boundary.mutate.mock.calls[0][0]).toEqual({
      key: "order_whatsapp",
      value: { enabled: true, language: "order", confirmation_enabled: true, delivery_enabled: true,
        follow_up_enabled: true, follow_up_days: 60, templates: {} },
    });
    expect(boundary.success).toHaveBeenCalledWith("WhatsApp settings saved");
    expect(screen.getByRole("button", { name: "Save WhatsApp settings" })).toBeDisabled();
  });

  it("previews the edited template with a sample order, and falls back to the default for the other language", () => {
    boundary.saved = { enabled: true, templates: { delivery_ar: "تم توصيل {{order_number}} يا {{customer_name}}" } };
    renderTab();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Delivery confirmation" }));
    expect(screen.getByTestId("order-whatsapp-preview")).toHaveTextContent("تم توصيل CM-10234 يا Sara");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("order-whatsapp-preview"))
      .toHaveTextContent("Hi Sara, your order #CM-10234 has been delivered. We hope you enjoy it!");
  });

  it("lists recent sends with the reason a message was skipped", async () => {
    boundary.rows = [{
      id: "m1", order_id: "o1", kind: "confirmation", status: "skipped", recipient: null, language: null,
      body: "", reason: "invalid_phone", provider_message_id: null,
      created_at: "2026-11-06T10:00:00Z", updated_at: "2026-11-06T10:00:00Z",
    }, {
      id: "m2", order_id: "o2", kind: "follow_up", status: "sent", recipient: "96550000001", language: "en",
      body: "Hi", reason: null, provider_message_id: "wa-1",
      created_at: "2026-11-06T09:00:00Z", updated_at: "2026-11-06T09:00:00Z",
    }];
    renderTab();

    expect(await screen.findByText("The order's phone number cannot receive WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("+96550000001")).toBeInTheDocument();
    await waitFor(() => expect(boundary.from).toHaveBeenCalledWith("order_whatsapp_messages"));
  });
});
