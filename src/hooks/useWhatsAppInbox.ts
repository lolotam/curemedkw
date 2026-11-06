import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { callWhatsAppInbox, type WhatsAppChat, type WhatsAppMessage } from "@/lib/whatsappInbox";
import { chunk } from "@/lib/whatsappInboxView";

export function useWhatsAppInbox(chatId: string | null, search: string) {
  const cache = useQueryClient();
  const chats = useInfiniteQuery({ queryKey: ["whatsapp-inbox", "chats", search], initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase.from("whatsapp_chats").select("*").eq("instance_identity", "curemed")
        .order("last_message_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false })
        .range(pageParam, pageParam + 199);
      const term = search.replace(/[,%()\\"]/g, "").trim();
      if (term) query = query.or(`display_name.ilike.%${term}%,normalized_phone.ilike.%${term}%`);
      const { data: rows, error } = await query;
      if (error) throw error;
      return rows as WhatsAppChat[];
    }, getNextPageParam: (last, pages) => last.length === 200 ? pages.length * 200 : undefined, refetchInterval: 15_000 });
  const messages = useInfiniteQuery({ queryKey: ["whatsapp-inbox", "messages", chatId], enabled: !!chatId,
    initialPageParam: null as { sent_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase.from("whatsapp_messages").select("*").eq("chat_id", chatId!).is("locally_deleted_at", null)
        .order("sent_at", { ascending: false }).order("id", { ascending: false }).limit(50);
      if (pageParam) query = query.or(`sent_at.lt.${pageParam.sent_at},and(sent_at.eq.${pageParam.sent_at},id.lt.${pageParam.id})`);
      const { data: rows, error } = await query;
      if (error) throw error;
      return rows as WhatsAppMessage[];
    }, getNextPageParam: last => last.length === 50 ? { sent_at: last[49].sent_at, id: last[49].id } : undefined,
    refetchInterval: 5_000 });
  const connection = useQuery({ queryKey: ["whatsapp-inbox", "connection"],
    queryFn: () => callWhatsAppInbox<{ connected: boolean; webhookReady: boolean }>({ action: "status" }), refetchInterval: 15_000 });
  useEffect(() => {
    const channel = supabase.channel(`whatsapp-inbox-${chatId ?? "list"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_chats" }, () => {
        void cache.invalidateQueries({ queryKey: ["whatsapp-inbox", "chats"] });
      }).on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages", ...(chatId ? { filter: `chat_id=eq.${chatId}` } : {}) }, () => {
        void cache.invalidateQueries({ queryKey: ["whatsapp-inbox", "messages", chatId] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache, chatId]);
  return { chats, messages, connection };
}

/** The `avatars.get` action accepts at most 50 chats per call. */
const AVATAR_BATCH = 50;
/** Signed picture URLs live an hour; refreshing before that keeps long-open screens showing pictures. */
const AVATAR_REFRESH_MS = 50 * 60 * 1000;
/** Each call looks up a few new pictures on WhatsApp; while some are still missing, ask again shortly. */
const AVATAR_PENDING_MS = 5_000;

type AvatarBatch = { avatars: Record<string, string | null>; pending: boolean };

/**
 * Profile picture URLs by chat id (null when a chat has none). Ids are sorted before batching so a
 * chat moving up the list does not change any query key, and the key lives outside the
 * `whatsapp-inbox` tree so a reply or a list refresh never re-signs every picture.
 */
export function useChatAvatars(chatIds: string[]): Record<string, string | null> {
  const batches = chunk([...new Set(chatIds)].sort(), AVATAR_BATCH);
  return useQueries({
    queries: batches.map(batch => ({
      queryKey: ["whatsapp-avatars", batch], staleTime: AVATAR_REFRESH_MS, retry: false,
      queryFn: () => callWhatsAppInbox<AvatarBatch>({ action: "avatars.get", chatIds: batch }),
      refetchInterval: (query: { state: { data?: AvatarBatch } }) => query.state.data?.pending ? AVATAR_PENDING_MS : AVATAR_REFRESH_MS,
    })),
    combine: results => Object.assign({}, ...results.map(result => result.data?.avatars ?? {})) as Record<string, string | null>,
  });
}

export type DeleteScope = "local" | "everyone";

/** Deletes a message for this inbox only, or for everyone on WhatsApp, then refreshes the thread and the list. */
export function useDeleteWhatsAppMessage() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; scope: DeleteScope }) => callWhatsAppInbox({ action: "message.delete", ...input }),
    onSettled: () => cache.invalidateQueries({ queryKey: ["whatsapp-inbox"] }),
  });
}
