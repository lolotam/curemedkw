import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppMessage } from "@/lib/whatsappInbox";
import { WhatsAppThread } from "./WhatsAppThread";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/clientRuntime", () => ({ supabase: { functions: { invoke } } }));

const message = (overrides: Partial<WhatsAppMessage>): WhatsAppMessage => ({
  id: "m-1", chat_id: "chat-1", instance_identity: "curemed", provider_message_id: "P1", direction: "inbound",
  message_type: "text", body: "", sent_at: "2026-11-05T10:00:00.000Z", ack_state: "accepted", media_object_id: null, ...overrides,
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

  it("loads an image through a signed URL and shows it inline from a local object URL", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { url: "https://storage.test/signed/photo", mime: "image/jpeg", fileName: "photo.jpg" } }, error: null });
    fetchMock.mockResolvedValue(fileResponse("image/jpeg"));
    renderThread([message({ id: "img", message_type: "image" })]);

    const image = await screen.findByRole("img", { name: "photo.jpg" });
    expect(image).toHaveAttribute("src", "blob:preview");
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

  it("puts each local day under its own date chip", () => {
    renderThread([message({ id: "a", sent_at: "2026-11-04T09:00:00.000Z" }), message({ id: "b", body: "later", sent_at: "2026-11-05T09:00:00.000Z" })]);
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });
});
