import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  Plus,
  RotateCcw,
  Save,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { useSiteSetting, useUpdateSiteSetting } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OrderWhatsAppTab } from "@/components/admin/OrderWhatsAppTab";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmailLivePreview } from "@/components/admin/EmailLivePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_SUBJECTS,
  DEFAULT_TEMPLATES,
  ORDER_EMAIL_TOKENS,
  buildOrderTokens,
  renderTemplate,
  SAMPLE_ITEMS,
  SAMPLE_ORDER,
  type EmailAudience,
  type EmailLang,
  type TemplateKey,
} from "@/lib/orderEmailTemplate";

const SETTINGS_KEY = "order_email";

interface OrderEmailSettings {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  storefront_url: string;
  /** Legacy mirrors of admin_emails, kept in sync so an old function still works. */
  to: string;
  cc: string[];
  admin_emails: string[];
  notify_customer: boolean;
  notify_admins: boolean;
  customer_language: EmailLang;
  admin_language: EmailLang;
  subjects: Partial<Record<TemplateKey, string>>;
  templates: Partial<Record<TemplateKey, string>>;
}

const DEFAULT: OrderEmailSettings = {
  enabled: true,
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: "",
  smtp_pass: "",
  from_email: "",
  from_name: "Curemed",
  reply_to: "",
  storefront_url: "",
  to: "",
  cc: [],
  admin_emails: [],
  notify_customer: true,
  notify_admins: true,
  customer_language: "ar",
  admin_language: "en",
  subjects: {},
  templates: {},
};

/** Older saves stored recipients as to + cc[]; admin_emails is canonical now. */
function hydrate(raw: Partial<OrderEmailSettings> | null): OrderEmailSettings {
  const merged = { ...DEFAULT, ...(raw ?? {}) };
  const adminEmails = merged.admin_emails?.length
    ? merged.admin_emails
    : [merged.to, ...(merged.cc ?? [])].filter((v) => v && v.includes("@"));
  return {
    ...merged,
    admin_emails: adminEmails,
    cc: merged.cc ?? [],
    subjects: merged.subjects ?? {},
    templates: merged.templates ?? {},
  };
}

interface EmailLogRow {
  id: string;
  audience: string;
  lang: string;
  recipient: string;
  subject: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function AdminOrderEmail() {
  const settingQ = useSiteSetting<Partial<OrderEmailSettings> | null>(SETTINGS_KEY, null);
  const update = useUpdateSiteSetting();

  const [draft, setDraft] = useState<OrderEmailSettings>(DEFAULT);
  const [saved, setSaved] = useState<OrderEmailSettings>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  // Password is never round-tripped into the form — only overwritten when typed.
  const [passInput, setPassInput] = useState("");
  const [passEditing, setPassEditing] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [audienceTab, setAudienceTab] = useState<EmailAudience>("customer");
  const [previewLang, setPreviewLang] = useState<EmailLang>("en");

  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [testTo, setTestTo] = useState("");
  const [testOrderId, setTestOrderId] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (settingQ.isLoading || hydrated) return;
    const next = hydrate(settingQ.data ?? null);
    setDraft(next);
    setSaved(next);
    setHydrated(true);
  }, [settingQ.data, settingQ.isLoading, hydrated]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved) || (passEditing && passInput.trim().length > 0),
    [draft, saved, passEditing, passInput],
  );

  const templateKey = `${audienceTab}_${previewLang}` as TemplateKey;
  const currentTemplate = draft.templates[templateKey] || DEFAULT_TEMPLATES[templateKey];
  const currentSubject = draft.subjects[templateKey] || DEFAULT_SUBJECTS[templateKey];

  const previewHtml = useMemo(() => {
    const tokens = buildOrderTokens(SAMPLE_ORDER, SAMPLE_ITEMS, {
      lang: previewLang,
      storefrontUrl: draft.storefront_url,
      storeName: draft.from_name,
    });
    return renderTemplate(currentTemplate, tokens);
  }, [currentTemplate, previewLang, draft.storefront_url, draft.from_name]);

  const logsQ = useQuery({
    queryKey: ["order_email_logs"],
    queryFn: async (): Promise<EmailLogRow[]> => {
      const { data, error } = await supabase
        .from("order_email_logs" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return (data ?? []) as unknown as EmailLogRow[];
    },
  });

  /**
   * One save for the whole key. The upsert replaces `value` wholesale, so a
   * partial payload here would silently destroy the SMTP credentials.
   */
  const save = () => {
    const nextPass = passEditing && passInput.trim() ? passInput.trim() : draft.smtp_pass;
    const adminEmails = draft.admin_emails.filter((e) => e.includes("@"));
    const payload: OrderEmailSettings = {
      ...draft,
      smtp_pass: nextPass,
      smtp_port: Number(draft.smtp_port) || 587,
      admin_emails: adminEmails,
      // Mirror the legacy shape so an un-upgraded function still delivers.
      to: adminEmails[0] ?? "",
      cc: adminEmails.slice(1),
    };
    update.mutate(
      { key: SETTINGS_KEY, value: payload },
      {
        onSuccess: () => {
          setDraft(payload);
          setSaved(payload);
          setPassInput("");
          setPassEditing(false);
          setShowPass(false);
          toast.success("Order email settings saved");
        },
        onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed to save"),
      },
    );
  };

  const addAdminEmail = () => {
    const value = newAdminEmail.trim().toLowerCase();
    if (!value.includes("@")) return toast.error("Enter a valid email address");
    if (draft.admin_emails.includes(value)) return setNewAdminEmail("");
    setDraft({ ...draft, admin_emails: [...draft.admin_emails, value] });
    setNewAdminEmail("");
  };

  const sendTest = async () => {
    setSendingTest(true);
    const { data, error } = await supabase.functions.invoke("send-order-email", {
      body: {
        mode: "test",
        audience: audienceTab,
        lang: previewLang,
        test_to: testTo.trim() || undefined,
        order_id: testOrderId.trim() || undefined,
      },
    });
    setSendingTest(false);
    logsQ.refetch();

    if (error) return toast.error(error.message);
    const res = data as {
      success?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: { message?: string };
      results?: { status: string; error: string | null; reason?: string }[];
    } | null;

    if (res?.success === false) return toast.error(res.error?.message ?? "Send failed");
    if (res?.skipped) return toast.message(`Skipped: ${res.reason}`);

    const failed = res?.results?.find((r) => r.status === "failed");
    if (failed) return toast.error(failed.error ?? "Send failed");
    const skipped = res?.results?.find((r) => r.status === "skipped");
    if (skipped && !res?.results?.some((r) => r.status === "sent")) {
      return toast.message(`Skipped: ${skipped.reason}`);
    }
    toast.success("Test email sent — check the inbox");
  };

  if (settingQ.isLoading) {
    return (
      <div className="p-6 md:p-10 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading email settings…
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 w-full max-w-none space-y-8">
      <AdminPageHeader
        title="Order Messages"
        subtitle="Emails and WhatsApp messages sent automatically for each order — to the customer and to your team."
        eyebrow="Automation"
        eyebrowIcon={MailCheck}
        gradient="cyan-sky-blue"
        actions={channel === "email" && (
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <Button onClick={save} disabled={!dirty || update.isPending} className="bg-brand hover:bg-brand/90 text-white">
              {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save all
            </Button>
          </div>
        )}
      />

      <Tabs value={channel} onValueChange={(v) => setChannel(v as "email" | "whatsapp")} className="space-y-8">
        <TabsList>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>
        {/* Both tabs stay mounted so switching never discards unsaved changes. */}
        <TabsContent value="email" forceMount className="space-y-8 data-[state=inactive]:hidden">

      <SectionCard title="Delivery" description="Master switch and who receives each email.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Enabled</Label>
            <p className="text-xs text-muted-foreground">Turn off to stop all order emails.</p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 pt-2">
          <AudienceControl
            label="Email the customer"
            hint="Sent to the address on the order."
            enabled={draft.notify_customer}
            onToggle={(v) => setDraft({ ...draft, notify_customer: v })}
            lang={draft.customer_language}
            onLang={(v) => setDraft({ ...draft, customer_language: v })}
          />
          <AudienceControl
            label="Email your team"
            hint="Sent to the admin recipients below."
            enabled={draft.notify_admins}
            onToggle={(v) => setDraft({ ...draft, notify_admins: v })}
            lang={draft.admin_language}
            onLang={(v) => setDraft({ ...draft, admin_language: v })}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Admin recipients"
        description="The first address is the To; the rest are Cc. Customers are never Cc'd."
      >
        <div className="flex flex-wrap gap-2">
          {draft.admin_emails.length === 0 && (
            <p className="text-xs text-muted-foreground">No admin recipients yet.</p>
          )}
          {draft.admin_emails.map((email, i) => (
            <Badge key={email} variant="secondary" className="gap-1 py-1 pl-2 pr-1">
              {i === 0 && <span className="text-[10px] uppercase opacity-60">to</span>}
              {email}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() =>
                  setDraft({ ...draft, admin_emails: draft.admin_emails.filter((e) => e !== email) })
                }
                className="ml-1 rounded hover:bg-background/60 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Input
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAdminEmail())}
            placeholder="orders@curemedkw.com"
            type="email"
          />
          <Button type="button" variant="outline" onClick={addAdminEmail}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="SMTP" description="Credentials are stored server-side and never exposed to the storefront.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Host">
            <Input value={draft.smtp_host} onChange={(e) => setDraft({ ...draft, smtp_host: e.target.value })} placeholder="smtp.example.com" />
          </Field>
          <Field label="Encryption">
            {/*
              Port and TLS are bound together deliberately. Setting implicit TLS
              on 587 makes the client send a TLS ClientHello to a STARTTLS port;
              the server answers with its plaintext "220" greeting and the TLS
              layer reports "received corrupt message of type InvalidContentType".
              Exposing the two as free fields let that combination be saved.
            */}
            <Select
              value={draft.smtp_port === 465 ? "ssl" : "starttls"}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  smtp_port: v === "ssl" ? 465 : 587,
                  smtp_secure: v === "ssl",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ssl">SSL/TLS — port 465 (recommended)</SelectItem>
                <SelectItem value="starttls">STARTTLS — port 587</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Username">
            <Input value={draft.smtp_user} onChange={(e) => setDraft({ ...draft, smtp_user: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <Input
                type={showPass ? "text" : "password"}
                value={passEditing ? passInput : draft.smtp_pass ? "••••••••" : ""}
                onChange={(e) => {
                  setPassEditing(true);
                  setPassInput(e.target.value);
                }}
                onFocus={() => setPassEditing(true)}
                placeholder={draft.smtp_pass ? "Stored — type to replace" : "SMTP password"}
                autoComplete="new-password"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPass((v) => !v)} aria-label="Toggle password visibility">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </Field>
          <Field label="From email">
            <Input value={draft.from_email} onChange={(e) => setDraft({ ...draft, from_email: e.target.value })} placeholder="no-reply@curemedkw.com" />
          </Field>
          <Field label="From name">
            <Input value={draft.from_name} onChange={(e) => setDraft({ ...draft, from_name: e.target.value })} />
          </Field>
          <Field label="Reply-to (optional)">
            <Input value={draft.reply_to} onChange={(e) => setDraft({ ...draft, reply_to: e.target.value })} placeholder="support@curemedkw.com" />
          </Field>
          <Field label="Storefront URL">
            <Input value={draft.storefront_url} onChange={(e) => setDraft({ ...draft, storefront_url: e.target.value })} placeholder="https://curemedkw.com" />
          </Field>
        </div>
        {draft.smtp_port !== 465 && (
          <p className="text-xs text-amber-600 dark:text-amber-500 pt-1">
            Gmail requires SSL/TLS on port 465 — STARTTLS on 587 is not negotiated by the mail
            library this function uses, and sends will fail.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <SectionCard
          title="Templates"
          description="Four forms: customer and admin, each in English and Arabic. Leave a field empty to use the built-in default."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={audienceTab} onValueChange={(v) => setAudienceTab(v as EmailAudience)}>
              <TabsList>
                <TabsTrigger value="customer">Customer</TabsTrigger>
                <TabsTrigger value="admin">Admin</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-1 rounded-md border border-border overflow-hidden text-xs">
              {(["en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setPreviewLang(l)}
                  aria-pressed={previewLang === l}
                  className={
                    previewLang === l
                      ? "px-3 py-1.5 bg-brand text-white"
                      : "px-3 py-1.5 bg-background hover:bg-muted text-muted-foreground"
                  }
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <TemplateForm
            templateKey={templateKey}
            subject={currentSubject}
            html={currentTemplate}
            isCustomSubject={Boolean(draft.subjects[templateKey])}
            isCustomHtml={Boolean(draft.templates[templateKey])}
            onSubject={(v) => setDraft({ ...draft, subjects: { ...draft.subjects, [templateKey]: v } })}
            onHtml={(v) => setDraft({ ...draft, templates: { ...draft.templates, [templateKey]: v } })}
            onResetSubject={() => {
              const next = { ...draft.subjects };
              delete next[templateKey];
              setDraft({ ...draft, subjects: next });
            }}
            onResetHtml={() => {
              const next = { ...draft.templates };
              delete next[templateKey];
              setDraft({ ...draft, templates: next });
            }}
          />
        </SectionCard>

        <div className="lg:sticky lg:top-6 space-y-4">
          <EmailLivePreview html={previewHtml} />
          <SectionCard title="Send a test" description="Uses the sample order above unless you name a real order id.">
            <div className="grid gap-3">
              <Field label="Send to">
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" type="email" />
              </Field>
              <Field label="Order id (optional)">
                <Input value={testOrderId} onChange={(e) => setTestOrderId(e.target.value)} placeholder="Render a real order's line items" />
              </Field>
              <p className="text-xs text-muted-foreground">
                Sends the <strong>{audienceTab}</strong> form in <strong>{previewLang.toUpperCase()}</strong>. A test never
                reaches a real customer — without a “Send to” address the customer form is skipped.
              </p>
              <Button type="button" variant="outline" onClick={sendTest} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send test
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Recent sends" description="One row per email. Written even when a send fails.">
        {logsQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (logsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Audience</th>
                  <th className="py-2 pr-4 font-medium">Lang</th>
                  <th className="py-2 pr-4 font-medium">Recipient</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(logsQ.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{row.audience}</td>
                    <td className="py-2 pr-4 uppercase text-xs">{row.lang}</td>
                    <td className="py-2 pr-4 break-all">{row.recipient}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.status === "sent" ? "secondary" : "destructive"}>{row.status}</Badge>
                      {row.error_message && (
                        <span className="block text-xs text-destructive mt-1">{row.error_message}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
        </TabsContent>
        <TabsContent value="whatsapp" forceMount className="data-[state=inactive]:hidden">
          <OrderWhatsAppTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function AudienceControl({
  label,
  hint,
  enabled,
  onToggle,
  lang,
  onLang,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  lang: EmailLang;
  onLang: (v: EmailLang) => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      <Select value={lang} onValueChange={(v) => onLang(v as EmailLang)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="ar">العربية</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function TemplateForm({
  templateKey,
  subject,
  html,
  isCustomSubject,
  isCustomHtml,
  onSubject,
  onHtml,
  onResetSubject,
  onResetHtml,
}: {
  templateKey: TemplateKey;
  subject: string;
  html: string;
  isCustomSubject: boolean;
  isCustomHtml: boolean;
  onSubject: (v: string) => void;
  onHtml: (v: string) => void;
  onResetSubject: () => void;
  onResetHtml: () => void;
}) {
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  const insertToken = (token: string) => {
    const el = htmlRef.current;
    const snippet = `{{${token}}}`;
    if (!el) return onHtml(html + snippet);
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    onHtml(html.slice(0, start) + snippet + html.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  return (
    <div className="space-y-4" key={templateKey}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Subject</Label>
          {isCustomSubject && (
            <button type="button" onClick={onResetSubject} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reset to default
            </button>
          )}
        </div>
        <Input value={subject} onChange={(e) => onSubject(e.target.value)} className="font-mono text-xs" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">HTML body</Label>
          {isCustomHtml && (
            <button type="button" onClick={onResetHtml} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reset to default
            </button>
          )}
        </div>
        <Textarea
          ref={htmlRef}
          value={html}
          onChange={(e) => onHtml(e.target.value)}
          rows={22}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Placeholders — click to insert</Label>
        <div className="flex flex-wrap gap-1.5">
          {ORDER_EMAIL_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {`{{${token}}}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
