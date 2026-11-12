import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { useSiteSetting, useUpdateSiteSetting } from "@/lib/db";
import { SectionCard } from "@/components/admin/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_ORDER_WHATSAPP, ORDER_WHATSAPP_SETTINGS_KEY, clampFollowUpDays, hydrateOrderWhatsApp,
  type OrderWhatsAppMessage, type OrderWhatsAppSettings,
} from "@/lib/orderWhatsApp";
import {
  ORDER_WHATSAPP_TOKENS, SAMPLE_WHATSAPP_TOKENS, renderWhatsAppTemplate, resolveWhatsAppTemplate,
  type OrderWhatsAppKind, type OrderWhatsAppLang, type OrderWhatsAppTemplateKey,
} from "@/lib/orderWhatsAppTemplate";

const KIND_LABELS: Record<OrderWhatsAppKind, { title: string; hint: string }> = {
  confirmation: { title: "Order confirmation", hint: "Thanks the customer as soon as the order is paid." },
  delivery: { title: "Delivery confirmation", hint: "Sent when the order is first marked delivered." },
  follow_up: { title: "Follow-up", hint: "Checks in with the customer some days after delivery." },
};

const REASON_LABELS: Record<string, string> = {
  invalid_phone: "The order's phone number cannot receive WhatsApp",
  disabled: "This message was switched off",
  not_delivered: "The order was no longer delivered",
  send_uncertain: "WhatsApp did not confirm the send; it was not retried",
};

function useOrderWhatsAppLog() {
  return useQuery({
    queryKey: ["order_whatsapp_messages"],
    queryFn: async (): Promise<OrderWhatsAppMessage[]> => {
      const { data, error } = await supabase.from("order_whatsapp_messages").select("*")
        .order("updated_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The WhatsApp tab of the order messages page. It saves its own site_settings key, so it can never
 * overwrite the email settings; messages are sent by the order-whatsapp-dispatch worker.
 */
export function OrderWhatsAppTab() {
  const settingQ = useSiteSetting<Partial<OrderWhatsAppSettings> | null>(ORDER_WHATSAPP_SETTINGS_KEY, null);
  const update = useUpdateSiteSetting();
  const logQ = useOrderWhatsAppLog();
  const [draft, setDraft] = useState<OrderWhatsAppSettings>(DEFAULT_ORDER_WHATSAPP);
  const [saved, setSaved] = useState<OrderWhatsAppSettings>(DEFAULT_ORDER_WHATSAPP);
  const [hydrated, setHydrated] = useState(false);
  const [kindTab, setKindTab] = useState<OrderWhatsAppKind>("confirmation");
  const [editLang, setEditLang] = useState<OrderWhatsAppLang>("ar");

  useEffect(() => {
    if (settingQ.isLoading || hydrated) return;
    const next = hydrateOrderWhatsApp(settingQ.data ?? null);
    setDraft(next);
    setSaved(next);
    setHydrated(true);
  }, [settingQ.data, settingQ.isLoading, hydrated]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const templateKey: OrderWhatsAppTemplateKey = `${kindTab}_${editLang}`;
  const template = resolveWhatsAppTemplate(draft.templates, templateKey);
  const preview = useMemo(() => renderWhatsAppTemplate(template, SAMPLE_WHATSAPP_TOKENS), [template]);

  const save = () => {
    const payload = { ...draft, follow_up_days: clampFollowUpDays(draft.follow_up_days) };
    update.mutate({ key: ORDER_WHATSAPP_SETTINGS_KEY, value: payload }, {
      onSuccess: () => { setDraft(payload); setSaved(payload); toast.success("WhatsApp settings saved"); },
      onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed to save"),
    });
  };
  const setTemplate = (value: string) => setDraft({ ...draft, templates: { ...draft.templates, [templateKey]: value } });
  const resetTemplate = () => {
    const templates = { ...draft.templates };
    delete templates[templateKey];
    setDraft({ ...draft, templates });
  };

  if (settingQ.isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading WhatsApp settings…</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button onClick={save} disabled={!dirty || update.isPending} className="bg-brand hover:bg-brand/90 text-white">
          {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save WhatsApp settings
        </Button>
      </div>

      <SectionCard title="Delivery" description="Sent from the WhatsApp number paired in the inbox, so every message also appears there.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="order-whatsapp-enabled">Enabled</Label>
            <p className="text-xs text-muted-foreground">
              While on, this replaces the Postora order confirmation to the customer. The Postora alert to your team is unchanged.
            </p>
          </div>
          <Switch id="order-whatsapp-enabled" checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Message language</Label>
            <Select value={draft.language} onValueChange={(v) => setDraft({ ...draft, language: v as OrderWhatsAppSettings["language"] })}>
              <SelectTrigger aria-label="Message language"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Follow the order's language</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Orders placed before languages were recorded get Arabic.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3 pt-2">
          {(["confirmation", "delivery", "follow_up"] as const).map((kind) => (
            <div key={kind} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor={`order-whatsapp-${kind}`}>{KIND_LABELS[kind].title}</Label>
                  <p className="text-xs text-muted-foreground">{KIND_LABELS[kind].hint}</p>
                </div>
                <Switch id={`order-whatsapp-${kind}`} checked={draft[`${kind}_enabled`]}
                  onCheckedChange={(v) => setDraft({ ...draft, [`${kind}_enabled`]: v })} />
              </div>
              {kind === "follow_up" && (
                <div className="space-y-1.5">
                  <Label htmlFor="order-whatsapp-days" className="text-xs">Days after delivery</Label>
                  <Input id="order-whatsapp-days" type="number" min={1} max={60} value={draft.follow_up_days}
                    onChange={(e) => setDraft({ ...draft, follow_up_days: Number(e.target.value) })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <SectionCard title="Templates" description="Plain text. Leave a template empty to use the built-in default.">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={kindTab} onValueChange={(v) => setKindTab(v as OrderWhatsAppKind)}>
              <TabsList>
                {(["confirmation", "delivery", "follow_up"] as const).map((kind) => (
                  <TabsTrigger key={kind} value={kind}>{KIND_LABELS[kind].title}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <LanguageToggle value={editLang} onChange={setEditLang} />
          </div>
          <TemplateEditor key={templateKey} value={template} isCustom={Boolean(draft.templates[templateKey]?.trim())}
            onChange={setTemplate} onReset={resetTemplate} rtl={editLang === "ar"} />
        </SectionCard>
        <div className="lg:sticky lg:top-6">
          <SectionCard title="Preview" description="Rendered with a sample order.">
            <div className="rounded-xl bg-[#e5ddd5] dark:bg-muted p-4">
              <p dir={editLang === "ar" ? "rtl" : "ltr"} data-testid="order-whatsapp-preview"
                className="ms-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-[#dcf8c6] dark:bg-emerald-900/60 px-3 py-2 text-sm shadow-sm">
                {preview}
              </p>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Recent sends" description="One row per message, including messages that were skipped or could not be confirmed.">
        <MessageLog query={logQ} />
      </SectionCard>
    </div>
  );
}

function MessageLog({ query }: { query: ReturnType<typeof useOrderWhatsAppLog> }) {
  if (query.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">Could not load the message log.</p>;
  if (!query.data?.length) return <p className="text-sm text-muted-foreground">No WhatsApp messages yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Message</th>
            <th className="py-2 pr-4 font-medium">Lang</th>
            <th className="py-2 pr-4 font-medium">Recipient</th>
            <th className="py-2 pr-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {query.data.map((row) => (
            <tr key={row.id} className="border-b border-border/60">
              <td className="py-2 pr-4 whitespace-nowrap text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleString()}</td>
              <td className="py-2 pr-4">{KIND_LABELS[row.kind].title}</td>
              <td className="py-2 pr-4 uppercase text-xs">{row.language ?? "—"}</td>
              <td className="py-2 pr-4 break-all" dir="ltr">{row.recipient ? `+${row.recipient}` : "—"}</td>
              <td className="py-2 pr-4">
                <Badge variant={row.status === "sent" ? "secondary" : row.status === "pending" || row.status === "sending" ? "outline" : "destructive"}>
                  {row.status}
                </Badge>
                {row.reason && <span className="block text-xs text-muted-foreground mt-1">{REASON_LABELS[row.reason] ?? row.reason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LanguageToggle({ value, onChange }: { value: OrderWhatsAppLang; onChange: (lang: OrderWhatsAppLang) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border overflow-hidden text-xs">
      {(["ar", "en"] as const).map((lang) => (
        <button key={lang} type="button" onClick={() => onChange(lang)} aria-pressed={value === lang}
          className={value === lang ? "px-3 py-1.5 bg-brand text-white" : "px-3 py-1.5 bg-background hover:bg-muted text-muted-foreground"}>
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function TemplateEditor({ value, isCustom, onChange, onReset, rtl }: {
  value: string; isCustom: boolean; onChange: (value: string) => void; onReset: () => void; rtl: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insertToken = (token: string) => {
    const el = ref.current;
    const snippet = `{{${token}}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + snippet + value.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + snippet.length, start + snippet.length); });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="order-whatsapp-template" className="text-xs">Message</Label>
          {isCustom && (
            <button type="button" onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reset to default
            </button>
          )}
        </div>
        <Textarea id="order-whatsapp-template" ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={8}
          maxLength={4096} dir={rtl ? "rtl" : "ltr"} className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Placeholders — click to insert</Label>
        <div className="flex flex-wrap gap-1.5">
          {ORDER_WHATSAPP_TOKENS.map((token) => (
            <button key={token} type="button" onClick={() => insertToken(token)}
              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
              {`{{${token}}}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
