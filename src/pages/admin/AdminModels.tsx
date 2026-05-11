import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Check,
  ChevronsUpDown,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Cpu,
  MessageSquare,
  Image as ImageIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  useProviderModels,
  PROVIDERS,
  PROVIDER_LABELS,
  type Provider,
  type ProviderModel,
  type ModelKind,
} from "@/lib/aiProviders";
import {
  useAiModels,
  DEFAULT_SLOTS,
  SLOT_LABELS,
  type Slot,
} from "@/lib/aiModels";
import { useUpscalePrompt, DEFAULT_UPSCALE_PROMPT } from "@/lib/upscalePrompt";
import { Textarea } from "@/components/ui/textarea";

function formatPricePerM(value?: string | number) {
  if (value === undefined || value === null || value === "") return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n === 0) return "—";
  const perM = n * 1_000_000;
  if (perM < 0.01) return `$${perM.toFixed(4)}`;
  if (perM < 1) return `$${perM.toFixed(3)}`;
  return `$${perM.toFixed(2)}`;
}

export default function AdminModels() {
  const { slots, setSlot, resetSlot, resetAll } = useAiModels();

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Models</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Configure AI providers and models for chat (used by AI product import) and image generation.
          Within each tab, models are tried top-to-bottom — Primary first, then Fallback #2, then #3.
        </p>
      </div>

      <Card className="p-5 mb-6 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand to-brand/60 flex items-center justify-center shrink-0">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-base">Multi-provider gateway</h2>
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <CheckCircle2 className="h-3 w-3" /> Active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            OpenRouter, OpenAI, and Google. Each provider uses its own configured API key secret.
          </p>
        </div>
      </Card>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 mb-6">
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Chat Models
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> Image Models
          </TabsTrigger>
        </TabsList>

        {(["chat", "image"] as const).map((kind) => (
          <TabsContent key={kind} value={kind} className="space-y-4">
            {([0, 1, 2] as const).map((idx) => (
              <SlotCard
                key={idx}
                kind={kind}
                index={idx}
                label={SLOT_LABELS[idx]}
                slot={slots[kind][idx]}
                onChange={(v) => setSlot(kind, idx, v)}
                onReset={() => resetSlot(kind, idx)}
                isDefault={
                  slots[kind][idx].provider === DEFAULT_SLOTS[kind][idx].provider &&
                  slots[kind][idx].model === DEFAULT_SLOTS[kind][idx].model
                }
              />
            ))}
            {kind === "image" && <UpscalePromptCard />}
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={resetAll} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Reset all to defaults
        </Button>
      </div>
    </div>
  );
}

function SlotCard({
  kind,
  index,
  label,
  slot,
  onChange,
  onReset,
  isDefault,
}: {
  kind: ModelKind;
  index: 0 | 1 | 2;
  label: string;
  slot: Slot;
  onChange: (v: Slot) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
            index === 0
              ? "bg-brand text-white"
              : "bg-muted text-muted-foreground border border-border",
          )}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">{label}</h3>
              {index === 0 && (
                <Badge variant="default" className="text-[10px]">Primary</Badge>
              )}
            </div>
            {!isDefault && (
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset to default
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
            <ProviderSelect
              value={slot.provider}
              onChange={(provider) => {
                // When provider switches, clear the model so admin must pick a valid one.
                onChange({ provider, model: "" });
              }}
            />
            <ModelSelect
              kind={kind}
              provider={slot.provider}
              value={slot.model}
              onChange={(model) => onChange({ provider: slot.provider, model })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: Provider;
  onChange: (p: Provider) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-11"
        >
          <span className="truncate text-left">{PROVIDER_LABELS[value]}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 z-50 bg-popover"
        align="start"
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {PROVIDERS.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === p ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {PROVIDER_LABELS[p]}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ModelSelect({
  kind,
  provider,
  value,
  onChange,
}: {
  kind: ModelKind;
  provider: Provider;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useProviderModels(provider);

  const filtered = useMemo(() => {
    return (data ?? []).filter((m) => m.kind === kind).sort((a, b) => a.id.localeCompare(b.id));
  }, [data, kind]);

  const selected = filtered.find((m) => m.id === value);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-destructive truncate">
            {(error as Error).message || "Failed to load models"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Check that the provider's API key secret is configured.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-11"
            disabled={isLoading}
          >
            <span className="truncate text-left">
              {isLoading
                ? "Loading models…"
                : selected
                  ? selected.name
                  : value || `Pick a ${kind} model`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 z-50 bg-popover"
          align="start"
        >
          <Command>
            <CommandInput placeholder={`Search ${kind} models…`} />
            <CommandList className="max-h-80">
              <CommandEmpty>No {kind} models found.</CommandEmpty>
              <CommandGroup>
                {filtered.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.id} ${m.name}`}
                    onSelect={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === m.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">
                        {m.id}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {isLoading ? (
        <Skeleton className="h-9" />
      ) : selected && (selected.context_length || selected.pricing) ? (
        <div className="grid grid-cols-3 gap-2">
          <Meta label="Context" value={selected.context_length ? `${selected.context_length.toLocaleString()} tok` : "—"} />
          <Meta label="In / 1M" value={formatPricePerM(selected.pricing?.prompt)} />
          <Meta label="Out / 1M" value={formatPricePerM(selected.pricing?.completion)} />
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}
