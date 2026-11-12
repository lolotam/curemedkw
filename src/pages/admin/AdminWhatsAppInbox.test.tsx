import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminWhatsAppInbox from "./AdminWhatsAppInbox";

const chats = [
  { id: "chat-a", instance_identity: "curemed", normalized_phone: "96550000001", remote_jid: null, display_name: "Nour",
    last_message_at: "2026-11-11T10:00:00.000Z", last_message_id: "PA", unread_count: 0, last_message_preview: null },
  { id: "chat-b", instance_identity: "curemed", normalized_phone: "96550000002", remote_jid: null, display_name: "Samia",
    last_message_at: "2026-11-10T10:00:00.000Z", last_message_id: "PB", unread_count: 0, last_message_preview: null },
];
const messageFor = (chatId: string, body: string, providerId: string) => ({
  id: `m-${chatId}`, chat_id: chatId, instance_identity: "curemed", provider_message_id: providerId, direction: "inbound",
  message_type: "text", body, sent_at: "2026-11-10T10:00:00.000Z", ack_state: "accepted", media_object_id: null, remote_deleted_at: null,
});
const messages: Record<string, unknown[]> = { "chat-a": [messageFor("chat-a", "Hello from Nour", "PA")], "chat-b": [messageFor("chat-b", "Hello from Samia", "PB")] };

// Supabase is the network boundary: a PostgREST query is a chain of filters awaited at the end.
const supabase = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), functions: { invoke: vi.fn() } }));
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase }));

function table(name: string) {
  let chatId = "";
  const query: Record<string, unknown> = {};
  for (const link of ["select", "order", "range", "or", "limit", "is", "in"]) query[link] = () => query;
  query.eq = (column: string, value: string) => { if (column === "chat_id") chatId = value; return query; };
  query.then = (resolve: (value: unknown) => void) => resolve({ data: name === "whatsapp_chats" ? chats : messages[chatId] ?? [], error: null });
  return query;
}

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><AdminWhatsAppInbox /></MemoryRouter></QueryClientProvider>);
}

describe("WhatsApp inbox page", () => {
  beforeEach(() => {
    supabase.from.mockImplementation(table);
    const channel = { on: () => channel, subscribe: () => channel };
    supabase.channel.mockReturnValue(channel);
    supabase.functions.invoke.mockImplementation((_name: string, { body }: { body: { action: string } }) => Promise.resolve({
      data: { success: true, data: body.action === "status" ? { connected: true, webhookReady: true } : { avatars: {}, pending: false } }, error: null,
    }));
    Element.prototype.scrollIntoView = vi.fn();
  });

  // Production regression, 2026-11-12: thread and composer shared one sibling key, so every chat switch left the previous
  // thread mounted beside the new one and the first chat's messages showed inside the next chat.
  it("replaces the open conversation when another chat is chosen instead of stacking threads", async () => {
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /Nour/ }));
    expect(await screen.findByText("Hello from Nour")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Samia/ }));
    expect(await screen.findByText("Hello from Samia")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nour/ }));
    await screen.findByText("Hello from Nour");

    const threads = screen.getAllByRole("log");
    expect(threads).toHaveLength(1);
    expect(within(threads[0]).queryByText("Hello from Samia")).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Type a message…")).toHaveLength(1);
  });
});
