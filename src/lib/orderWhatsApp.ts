import type { OrderWhatsAppKind, OrderWhatsAppTemplateKey } from "@/lib/orderWhatsAppTemplate";

export const ORDER_WHATSAPP_SETTINGS_KEY = "order_whatsapp";

/** site_settings.order_whatsapp, read by public.owa_enqueue_confirmation and public.owa_claim_due. */
export interface OrderWhatsAppSettings {
  enabled: boolean;
  /** "order" follows the language the customer checked out in (Arabic for older orders). */
  language: "order" | "ar" | "en";
  confirmation_enabled: boolean;
  delivery_enabled: boolean;
  follow_up_enabled: boolean;
  follow_up_days: number;
  templates: Partial<Record<OrderWhatsAppTemplateKey, string>>;
}

export const DEFAULT_ORDER_WHATSAPP: OrderWhatsAppSettings = {
  enabled: false,
  language: "order",
  confirmation_enabled: true,
  delivery_enabled: true,
  follow_up_enabled: true,
  follow_up_days: 3,
  templates: {},
};

/** The server clamps follow_up_days to 1–60 the same way. */
export function clampFollowUpDays(value: number): number {
  return Number.isFinite(value) ? Math.min(60, Math.max(1, Math.floor(value))) : DEFAULT_ORDER_WHATSAPP.follow_up_days;
}

export function hydrateOrderWhatsApp(raw: Partial<OrderWhatsAppSettings> | null): OrderWhatsAppSettings {
  const merged = { ...DEFAULT_ORDER_WHATSAPP, ...(raw ?? {}) };
  return { ...merged, templates: merged.templates ?? {}, follow_up_days: clampFollowUpDays(Number(merged.follow_up_days)) };
}

/** A row of public.order_whatsapp_messages, the queue and log of order WhatsApp messages. */
export type OrderWhatsAppMessage = {
  id: string;
  order_id: string;
  kind: OrderWhatsAppKind;
  status: "pending" | "sending" | "sent" | "uncertain" | "skipped" | "expired";
  recipient: string | null;
  language: "ar" | "en" | null;
  body: string;
  reason: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
};
