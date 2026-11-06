import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import { WhatsAppThread } from "./WhatsAppThread";

const invoke = vi.hoisted(() => vi.fn());
const chatRows = vi.hoisted(() => ({ current: [] as unknown[] }));
// A PostgREST query is a chain of filters awaited at the end; every link returns the chain itself.
const from = vi.hoisted(() => vi.fn(() => {
  const query: Record<string, unknown> = {};
  for (const link of ["select", "eq", "order", "range", "or", "limit"]) query[link] = () => query;
  query.then = (resolve: (value: unknown) => void) => resolve({ data: chatRows.current, error: null });
  return query;
}));
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: { functions: { invoke }, from } }));

const message = (overrides: Partial<WhatsAppMessage>): WhatsAppMessage => ({
  id: "m-1", chat_id: "chat-1", instance_identity: "curemed", provider_message_id: "P1", direction: "inbound",
  message_type: "text", body: "", sent_at: "2026-11-05T10:00:00.000Z", ack_state: "accepted", media_object_id: null,
  remote_deleted_at: null, ...overrides,
});

const fileResponse = (type: string) => ({ ok: true, blob: async () => new Blob(["bytes"], { type }) });

function renderThread(messages: WhatsAppMessage[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <WhatsAppThread chatId="chat-1" messages={messages} isLoading={false} failed={false} hasOlder={false} loadingOlder={false} onLoadOlder={() => {}} />
  </QueryClientProvider>);
}

describe("WhatsApp thread", () => {
  const fetchMock = vi.fn();
  const clicked: { href: string; download: string }[] = [];

  beforeEach(() => {
    invoke.mockReset();
    fetchMock.mockReset();
    clicked.length = 0;
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no object URLs and does not navigate on anchor clicks; record what would be saved instead.
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the text with clickable links and spells out the delivery state of outbound messages", () => {
    renderThread([
      message({ id: "in", body: "Track it at https://curemedkw.com/orders/7" }),
      message({ id: "out", direction: "outbound", body: "Thanks", ack_state: "read", sent_at: "2026-11-05T10:05:00.000Z" }),
      message({ id: "odd", message_type: "unsupported", sent_at: "2026-11-05T10:06:00.000Z" }),
    ]);
    const link = screen.getByRole("link", { name: "https://curemedkw.com/orders/7" });
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("img", { name: "Read" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Sent|Delivered|Failed|Read/ })).toHaveLength(1);
    expect(screen.getByText("Unsupported message")).toBeInTheDocument();
  });

  it("loads an image through a signed URL and shows it inline under the recorded MIME type", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { url: "https://storage.test/signed/photo", mime: "image/jpeg", fileName: "photo.jpg" } }, error: null });
    // Storage may answer with a generic Content-Type; the MIME recorded by media.get must win.
    fetchMock.mockResolvedValue(fileResponse("application/octet-stream"));
    renderThread([message({ id: "img", message_type: "image" })]);

    const image = await screen.findByRole("img", { name: "photo.jpg" });
    expect(image).toHaveAttribute("src", "blob:preview");
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toHaveProperty("type", "image/jpeg");
    expect(invoke).toHaveBeenCalledWith("whatsapp-inbox", { body: { action: "media.get", messageId: "img" } });
    expect(fetchMock).toHaveBeenCalledWith("https://storage.test/signed/photo");
  });

  it("downloads a document under its WhatsApp file name and reuses the fetched file on a second download", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { url: "https://storage.test/signed/doc", mime: "application/vnd.ms-excel", fileName: "prices.xlsx" } }, error: null });
    fetchMock.mockResolvedValue(fileResponse("application/vnd.ms-excel"));
    renderThread([message({ id: "doc", message_type: "document",
      provider_media: { message: { documentMessage: { fileName: "prices.xlsx", mimetype: "application/vnd.ms-excel" } } } })]);

    const chip = screen.getByRole("button", { name: "Download: prices.xlsx" });
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(chip);
    await waitFor(() => expect(clicked).toEqual([{ href: "blob:preview", download: "prices.xlsx" }]));
    await waitFor(() => expect(chip).toBeEnabled());
    fireEvent.click(chip);
    await waitFor(() => expect(clicked).toHaveLength(2));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a download chip with the reason when an attachment cannot be loaded", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: { code: "media_unavailable" } }, error: null });
    renderThread([message({ id: "voice", message_type: "audio" })]);

    // The media query retries once before giving up, so allow for the retry delay.
    const fallback = await screen.findByText("Attachment unavailable or expired. Try again.", undefined, { timeout: 4000 });
    expect(within(fallback.parentElement!).getByRole("button", { name: "Download: Voice message" })).toBeInTheDocument();
  });

  it("keeps a message deleted for everyone in place as a placeholder, without its content or delivery ticks", () => {
    renderThread([message({ id: "gone", direction: "outbound", body: "Old price list", ack_state: "read",
      remote_deleted_at: "2026-11-05T10:01:00.000Z" })]);
    expect(screen.getByText("This message was deleted")).toBeInTheDocument();
    expect(screen.queryByText("Old price list")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Read" })).not.toBeInTheDocument();
  });

  it("asks for the delete scope and offers delete for everyone only for our own recent messages", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { deleted: true } }, error: null });
    const recent = new Date().toISOString();
    renderThread([message({ id: "theirs", body: "Customer text", sent_at: recent }),
      message({ id: "ours", direction: "outbound", body: "Our text", sent_at: recent })]);
    const [theirsMenu, oursMenu] = screen.getAllByRole("button", { name: "Message options" });

    fireEvent.keyDown(theirsMenu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const customerDialog = await screen.findByRole("alertdialog");
    expect(within(customerDialog).queryByRole("button", { name: "Delete for everyone" })).not.toBeInTheDocument();
    fireEvent.click(within(customerDialog).getByRole("button", { name: "Delete for me" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("whatsapp-inbox",
      { body: { action: "message.delete", messageId: "theirs", scope: "local" } }));

    fireEvent.keyDown(oursMenu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete for everyone" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("whatsapp-inbox",
      { body: { action: "message.delete", messageId: "ours", scope: "everyone" } }));
  });

  it("forwards to the chosen chat and retries a failed forward under the same request id", async () => {
    chatRows.current = [
      { id: "chat-1", normalized_phone: "96550000001", display_name: "Current chat" },
      { id: "chat-2", normalized_phone: "96550000002", display_name: "Sara Ali" },
    ];
    invoke.mockResolvedValueOnce({ data: { success: false, error: { code: "inbox_unavailable" } }, error: null })
      .mockResolvedValueOnce({ data: { success: true, data: { sent: true } }, error: null });
    renderThread([message({ id: "price", body: "Price list" })]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Message options" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Forward" }));
    const dialog = await screen.findByRole("dialog");
    // The message's own chat is not offered as a target.
    expect(within(dialog).queryByText("Current chat")).not.toBeInTheDocument();
    fireEvent.click(await within(dialog).findByText("Sara Ali"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Forward" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    fireEvent.click(within(dialog).getByRole("button", { name: "Forward" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const [first, retry] = invoke.mock.calls.map(call => call[1].body);
    expect(first).toMatchObject({ action: "message.forward", messageId: "price", chatId: "chat-2" });
    expect(retry.requestId).toBe(first.requestId);
  });

  it("puts each local day under its own date chip", () => {
    renderThread([message({ id: "a", sent_at: "2026-11-04T09:00:00.000Z" }), message({ id: "b", body: "later", sent_at: "2026-11-05T09:00:00.000Z" })]);
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });
});
