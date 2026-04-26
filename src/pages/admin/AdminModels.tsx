import { useMemo, useState } from "react";
import {
  Sparkles,
  Check,
  ChevronsUpDown,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Cpu,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  useOpenRouterModels,
  type OpenRouterModel,
} from "@/lib/aiImport";
import {
  useAiModels,
  DEFAULT_AI_MODELS,
  SLOT_LABELS,
} from "@/lib/aiModels";

function formatPricePerM(value?: string | number) {
  if (value === undefined || value === null || value === "") return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n === 0) return "—";
  // OpenRouter pricing is per-token in USD; convert to per-1M tokens
  const perM = n * 1_000_000;
  if (perM < 0.01) return `$${perM.toFixed(4)}`;
  if (perM < 1) return `$${perM.toFixed(3)}`;
  return `$${perM.toFixed(2)}`;
}

export default function AdminModels() {
  const { data: models, isLoading, error, refetch, isRefetching } = useOpenRouterModels();
  const { models: selected, setModelAt, resetSlot, resetAll } = useAiModels();

  const sortedModels = useMemo(() => {
    if (!models) return [];
    return [...models].sort((a, b) => a.id.localeCompare(b.id));
  }, [models]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Models</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Configure which model handles AI product imports. Models are tried top-to-bottom — if the
          Primary fails or is rate-limited, Fallback #2 then Fallback #3 runs automatically.
        </p>
      </div>

      {/* Provider */}
      <Card className="p-5 mb-6 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand to-brand/60 flex items-center justify-center shrink-0">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-base">OpenRouter</h2>
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <CheckCircle2 className="h-3 w-3" /> Active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Provider — API key configured via secret <code className="font-mono">OPENROUTER_API_KEY</code>.
            {models && ` ${models.length} models available.`}
          </p>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="p-4 mb-6 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Failed to load models</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(error as Error).message || "Unable to reach OpenRouter."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            Retry
          </Button>
        </Card>
      )}

      {/* Slots */}
      <div className="space-y-4">
        {([0, 1, 2] as const).map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            label={SLOT_LABELS[slot]}
            selectedId={selected[slot]}
            models={sortedModels}
            isLoading={isLoading}
            onSelect={(id) => setModelAt(slot, id)}
            onReset={() => resetSlot(slot)}
            isDefault={selected[slot] === DEFAULT_AI_MODELS[slot]}
          />
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={resetAll} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Reset all to defaults
        </Button>
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  label,
  selectedId,
  models,
  isLoading,
  onSelect,
  onReset,
  isDefault,
}: {
  slot: 0 | 1 | 2;
  label: string;
  selectedId: string;
  models: OpenRouterModel[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === selectedId);

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
            slot === 0
              ? "bg-brand text-white"
              : "bg-muted text-muted-foreground border border-border",
          )}
        >
          {slot + 1}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">{label}</h3>
              {slot === 0 && (
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
                      : selectedId}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0 z-50 bg-popover"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search models…" />
                <CommandList className="max-h-80">
                  <CommandEmpty>No models found.</CommandEmpty>
                  <CommandGroup>
                    {models.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={`${m.id} ${m.name}`}
                        onSelect={() => {
                          onSelect(m.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            selectedId === m.id ? "opacity-100" : "opacity-0",
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

          {/* Meta strip */}
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : selected ? (
            <div className="grid grid-cols-3 gap-3 pt-1">
              <Meta label="Context" value={selected.context_length ? `${selected.context_length.toLocaleString()} tok` : "—"} />
              <Meta label="Input / 1M" value={formatPricePerM(selected.pricing?.prompt)} />
              <Meta label="Output / 1M" value={formatPricePerM(selected.pricing?.completion)} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground font-mono">{selectedId}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}