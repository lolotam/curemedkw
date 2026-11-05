import { useEffect } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { callWhatsAppInbox, type WhatsAppChat, type WhatsAppMessage } from "@/lib/whatsappInbox";
import { chunk, type ChatPreview } from "@/lib/whatsappInboxView";

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
      let query = supabase.from("whatsapp_messages").select("*").eq("chat_id", chatId!)
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

/** PostgREST `in` lists travel in the URL; 50 provider ids keep each request well under URL limits. */
const PREVIEW_BATCH = 50;

/**
 * Last-message previews for the loaded chats, keyed by provider message id.
 *
 * `whatsapp_chats` keeps only `last_message_id`, so the rows it points at are read back in batches
 * (one request per 50 chats). The key changes whenever a chat gets a new last message, and the
 * previous map stays on screen while the new one loads.
 */
export function useChatPreviews(chats: WhatsAppChat[]) {
  const ids = [...new Set(chats.map(chat => chat.last_message_id).filter((id): id is string => !!id))].sort();
  return useQuery({ queryKey: ["whatsapp-inbox", "previews", ids], enabled: ids.length > 0, placeholderData: keepPreviousData,
    queryFn: async () => {
      const batches = await Promise.all(chunk(ids, PREVIEW_BATCH).map(async batch => {
        const { data: rows, error } = await supabase.from("whatsapp_messages")
          .select("chat_id,provider_message_id,body,message_type,direction,ack_state")
          .eq("instance_identity", "curemed").in("provider_message_id", batch);
        if (error) throw error;
        return rows as ChatPreview[];
      }));
      return new Map(batches.flat().map(row => [row.provider_message_id, row]));
    } });
}
