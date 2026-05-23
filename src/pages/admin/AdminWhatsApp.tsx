import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus, X, Send, Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WaSettings {
  enabled: boolean;
  language: "ar" | "en";
  api_key: string;
  admin_numbers: string[];
  events: {
    order_paid: boolean;
    order_shipped: boolean;
    admin_new_order: boolean;
    cart_abandoned: boolean;
    review_request: boolean;
  };
  templates: Record<string, string>;
}

const DEFAULT: WaSettings = {
  enabled: true,
  language: "ar",
  api_key: "",
  admin_numbers: [],
  events: {
    order_paid: true,
    order_shipped: false,
    admin_new_order: true,
    cart_abandoned: false,
    review_request: false,
  },
  templates: {},
};

const EVENTS: { key: keyof WaSettings["events"]; label: string; hint: string }[] = [
  { key: "admin_new_order", label: "Admin: new order alert", hint: "Sent to your admin numbers after every checkout" },
  { key: "order_paid", label: "Customer: order confirmation", hint: "Sent to the customer right after checkout" },
  { key: "order_shipped", label: "Customer: order shipped", hint: "Sent when an admin marks the order shipped" },
  { key: "cart_abandoned", label: "Customer: abandoned cart", hint: "(Future — needs cron)" },
  { key: "review_request", label: "Customer: review request", hint: "(Future — needs scheduler)" },
];

const TEMPLATE_FIELDS: { eventKey: string; placeholders: string }[] = [
  { eventKey: "admin_new_order", placeholders: "{{order_number}} {{customer_name}} {{customer_phone}} {{total}} {{items_summary}}" },
  { eventKey: "order_paid", placeholders: "{{customer_name}} {{order_number}} {{total}} {{invoice_url}}" },
  { eventKey: "order_shipped", placeholders: "{{order_number}} {{customer_name}}" },
];

export default function AdminWhatsApp() {
  const qc = useQueryClient();
  const [s, setS] = useState<WaSettings>(DEFAULT);
  const [newNum, setNewNum] = useState("");
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["wa_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "whatsapp_integration")
        .maybeSingle();
      return (data?.value as any as WaSettings) ?? null;
    },
  });

  useEffect(() => {
    if (settingsQ.data) setS({ ...DEFAULT, ...settingsQ.data, events: { ...DEFAULT.events, ...(settingsQ.data.events ?? {}) } });
  }, [settingsQ.data]);

  const logsQ = useQuery({
    queryKey: ["wa_logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_send_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "whatsapp_integration", value: s as any }, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["wa_settings"] });
  };

  const addNumber = () => {
    const n = newNum.replace(/[^\d+]/g, "");
    if (n.length < 6) return toast.error("Enter a valid number with country code");
    if (s.admin_numbers.includes(n)) return;
    setS({ ...s, admin_numbers: [...s.admin_numbers, n] });
    setNewNum("");
  };

  const sendTest = async () => {
    if (!testTo) return toast.error("Enter a test number");
    setSendingTest(true);
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { event: "test", to: [testTo], data: {} },
    });
    setSendingTest(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.skipped) toast.message(`Skipped: ${(data as any).reason}`);
    else toast.success("Test sent — check WhatsApp & the log below");
    qc.invalidateQueries({ queryKey: ["wa_logs"] });
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-8">
      <header className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-[hsl(142,70%,49%)]/15 text-[hsl(142,70%,35%)] flex items-center justify-center">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp (Postora)</h1>
          <p className="text-sm text-muted-foreground">Order alerts & customer messages via your Postora WhatsApp account.</p>
        </div>
      </header>

      {/* Master toggle */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Integration enabled</Label>
            <p className="text-xs text-muted-foreground">If off, no messages will be sent.</p>
          </div>
          <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Default message language</Label>
            <Select value={s.language} onValueChange={(v: "ar" | "en") => setS({ ...s, language: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">Arabic</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Admin numbers */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <Label className="text-base">Admin WhatsApp numbers</Label>
        <p className="text-xs text-muted-foreground">Include country code, no spaces. e.g. 96560003759</p>
        <div className="flex gap-2">
          <Input
            placeholder="96560003759"
            value={newNum}
            onChange={(e) => setNewNum(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNumber())}
          />
          <Button type="button" onClick={addNumber}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {s.admin_numbers.length === 0 && <p className="text-xs text-muted-foreground">No admin numbers yet.</p>}
          {s.admin_numbers.map((n) => (
            <Badge key={n} variant="secondary" className="gap-1.5">
              {n}
              <button onClick={() => setS({ ...s, admin_numbers: s.admin_numbers.filter((x) => x !== n) })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Events */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Label className="text-base">Events</Label>
        {EVENTS.map((ev) => (
          <div key={ev.key} className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
            <div>
              <p className="font-medium text-sm">{ev.label}</p>
              <p className="text-xs text-muted-foreground">{ev.hint}</p>
            </div>
            <Switch
              checked={s.events[ev.key]}
              onCheckedChange={(v) => setS({ ...s, events: { ...s.events, [ev.key]: v } })}
            />
          </div>
        ))}
      </div>

      {/* Templates */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Label className="text-base">Custom templates (optional)</Label>
        <p className="text-xs text-muted-foreground">Leave blank to use defaults. Suffix is the language code.</p>
        {TEMPLATE_FIELDS.map((f) => (
          <div key={f.eventKey} className="space-y-2">
            <Label className="text-sm">{f.eventKey} — {s.language}</Label>
            <Textarea
              rows={3}
              placeholder={`Default will be used. Placeholders: ${f.placeholders}`}
              value={s.templates[`${f.eventKey}_${s.language}`] ?? ""}
              onChange={(e) => setS({ ...s, templates: { ...s.templates, [`${f.eventKey}_${s.language}`]: e.target.value } })}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving} className="bg-brand hover:bg-brand/90 text-white">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save settings
        </Button>
      </div>

      {/* Send test */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <Label className="text-base">Send a test message</Label>
        <div className="flex gap-2">
          <Input placeholder="96560003759" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button onClick={sendTest} disabled={sendingTest} variant="outline">
            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-2">Send</span>
          </Button>
        </div>
      </div>

      {/* Logs */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-base">Recent activity</Label>
          <Button size="sm" variant="ghost" onClick={() => logsQ.refetch()}>Refresh</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Time</th>
                <th className="text-left py-2 pr-3">Event</th>
                <th className="text-left py-2 pr-3">Recipient</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {(logsQ.data ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No messages sent yet.</td></tr>
              )}
              {(logsQ.data ?? []).map((l: any) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{l.event}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{l.recipient}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={l.status === "sent" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>
                      {l.status}
                    </Badge>
                  </td>
                  <td className="py-2 text-xs text-destructive max-w-md truncate" title={l.error_message ?? ""}>{l.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
