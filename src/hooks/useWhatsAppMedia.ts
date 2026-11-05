import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callWhatsAppInbox } from "@/lib/whatsappInbox";

export type WhatsAppMediaBlob = { blob: Blob; mimeType: string; fileName: string };

/**
 * Query for one message's attachment: `media.get` returns a short-lived signed storage URL, and the
 * file is fetched into a Blob right away so the URL expiring later no longer matters.
 *
 * The key lives outside the `whatsapp-inbox` tree on purpose: sending a reply invalidates that whole
 * tree, which would re-download every attachment on screen. Attachment bytes never change, hence
 * `staleTime: Infinity`.
 */
function mediaBlobQuery(messageId: string) {
  return {
    queryKey: ["whatsapp-media", messageId],
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<WhatsAppMediaBlob> => {
      const media = await callWhatsAppInbox<{ url: string; mime: string; fileName: string }>({ action: "media.get", messageId });
      const response = await fetch(media.url);
      if (!response.ok) throw new Error("media_fetch_failed");
      const blob = await response.blob();
      return { blob, mimeType: media.mime || blob.type, fileName: media.fileName };
    },
  };
}

/** The attachment Blob of a message, fetched only once `enabled` turns true. */
export function useWhatsAppMediaBlob(messageId: string, enabled: boolean) {
  return useQuery({ ...mediaBlobQuery(messageId), enabled });
}

/**
 * Saves a Blob through a temporary `<a download>`. The link must point at a same-origin object URL:
 * browsers ignore `download` on cross-origin links such as the signed storage URL.
 */
function saveBlobAs(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Firefox can still be reading the URL right after click(); revoke once the download has started.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads a message attachment to the device, reusing the Blob already fetched for its preview. */
export function useDownloadWhatsAppMedia() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const media = await cache.fetchQuery(mediaBlobQuery(messageId));
      saveBlobAs(media.blob, media.fileName);
    },
  });
}
