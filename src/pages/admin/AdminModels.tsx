import { useMemo, useState } from "react";
import { Sparkles, Check, ChevronsUpDown, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { useOpenRouterModels, type OpenRouterModel } from "@/lib/aiImport";
import {
  AI_MODEL_SLOT_LABELS,
  DEFAULT_AI_MODELS,
  useAiModels,
} from "@/lib/aiModels";

function formatPricePerMillion(perToken?: string) {
  if (!perToken) return null;
  const n = Number(perToken);
  if (!Number.isFinite(n) || n <= 0) return null;
  const perM = n * 1_000_000;
  return `$${perM.toFixed(perM < 1 ? 3 : 2)}/1M`;
}

interface SlotCardProps {
  slot: 0 | 1 | 2;
  selectedId: string;
  models: OpenRouterModel[] | undefined;
  loading: boolean;
  error: unknown;
  onChange: (id: string) => void;
  onReset: () => void;
}

function SlotCard({ slot, selectedId, models, loading, error, onChange, onReset }: SlotCardProps) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => (models ? [...models].sort((a, b) => a.id.localeCompare(b.id)) : []),
    [models],
  );
  const selected = models?.find((m) => m.id === selectedId);
  const isDefault = selectedId === DEFAULT_AI_MODELS[slot];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-semibold">
            {slot + 1}
          </div>
          <div>
            <h3 className="font-semibold leading-tight">{AI_MODEL_SLOT_LABELS[slot]}</h3>
            <p className="text-xs text-muted-foreground">
              {slot === 0
                ? "Tried first for every AI extraction."
                : `Used if ${slot === 1 ? "Primary" : "Fallback #2"} fails or hits a rate limit.`}
            </p>
          </div>
        </div>
        {!isDefault && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Model</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal h-11"
            >
              <span className="truncate text-left">
                {loading
                  ? "Loading models…"
                  : selected
                    ? `${selected.name}`
                    : selectedId}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Search models…" />
              <CommandList className="max-h-80">
                <CommandEmpty>
                  {error ? "Failed to load models" : "No models found"}
                </CommandEmpty>
                <CommandGroup>
                  {sorted.map((m) => (
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
                          "mr-2 h-4 w-4",
                          selectedId === m.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {m.id}
                          {m.context_length
                            ? ` · ${m.context_length.toLocaleString()} ctx`
                            : ""}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {loading ? (
          <Skeleton className="h-4 w-3/4" />
        ) : selected ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <code className="font-mono text-[11px] text-foreground">{selected.id}</code>
            {selected.context_length && (
              <span>· {selected.context_length.toLocaleString()} ctx</span>
            )}
            {formatPricePerMillion(selected.pricing?.prompt) && (
              <span>· in {formatPricePerMillion(selected.pricing?.prompt)}</span>
            )}
            {formatPricePerMillion(selected.pricing?.completion) && (
              <span>· out {formatPricePerMillion(selected.pricing?.completion)}</span>
            )}
          </div>
        ) : (
          <span>
            <code className="font-mono text-[11px] text-foreground">{selectedId}</code> (not in
            current OpenRouter list)
          </span>
        )}
      </div>
    </Card>
  );
}

export default function AdminModels() {
  const { models, setModelAt, resetSlot, resetAll } = useAiModels();
  const { data, isLoading, error, refetch, isFetching } = useOpenRouterModels();

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Models</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Configure which model handles AI product imports. Models are tried top-to-bottom — if
          Primary fails or is rate-limited, Fallback #2 then Fallback #3 runs automatically.
        </p>
      </div>

      <Card className="p-5 flex items-center gap-4 border-brand/40 bg-gradient-to-br from-brand/5 to-transparent">
        <div className="h-11 w-11 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">OpenRouter</h2>
            <Badge variant="secondary" className="text-[10px]">
              Provider
            </Badge>
            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15">
              Active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Single gateway to every supported model. API key stored as a secure backend secret.
          </p>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-destructive">Could not load OpenRouter models</p>
            <p className="text-xs text-muted-foreground">
              {(error as Error)?.message || "Unknown error"}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retry"}
          </Button>
        </Card>
      )}

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <SlotCard
            key={i}
            slot={i as 0 | 1 | 2}
            selectedId={models[i]}
            models={data}
            loading={isLoading}
            error={error}
            onChange={(id) => setModelAt(i as 0 | 1 | 2, id)}
            onReset={() => resetSlot(i as 0 | 1 | 2)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Defaults: {DEFAULT_AI_MODELS.join(" → ")}
        </p>
        <Button variant="outline" size="sm" onClick={resetAll} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Reset all to defaults
        </Button>
      </div>
    </div>
  );
}
