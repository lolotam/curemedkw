import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FLAGSHIP_MODELS,
  OTHER_MODELS,
  RESIDENCY_MODELS,
  TIERS,
  formatPrice,
} from "@/lib/openaiPricing";

function PriceCell({ value }: { value: number | null }) {
  return (
    <td className="p-4 align-middle text-right tabular-nums">
      {value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-medium">{formatPrice(value)}</span>
      )}
    </td>
  );
}

function FlagshipTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b">
            <th rowSpan={2} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground border-r border-border">
              Model
            </th>
            <th colSpan={3} className="h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-foreground border-r border-border">
              Short context
            </th>
            <th colSpan={3} className="h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-foreground">
              Long context
            </th>
          </tr>
          <tr className="border-b">
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">Input</th>
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">Cached input</th>
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs border-r border-border">Output</th>
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">Input</th>
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">Cached input</th>
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">Output</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {FLAGSHIP_MODELS.map((row) => (
            <tr key={row.model} className="border-b transition-colors hover:bg-muted/50">
              <td className="p-4 align-middle font-mono text-sm border-r border-border">{row.model}</td>
              <PriceCell value={row.short.input} />
              <PriceCell value={row.short.cached} />
              <td className="p-4 align-middle text-right tabular-nums border-r border-border">
                {row.short.output === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="font-medium">{formatPrice(row.short.output)}</span>
                )}
              </td>
              <PriceCell value={row.long.input} />
              <PriceCell value={row.long.cached} />
              <PriceCell value={row.long.output} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OtherModelsTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Input</TableHead>
            <TableHead className="text-right">Cached input</TableHead>
            <TableHead className="text-right">Output</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {OTHER_MODELS.map((row) => (
            <TableRow key={row.model}>
              <TableCell className="font-mono text-sm">{row.model}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.input === null ? <span className="text-muted-foreground">—</span> : <span className="font-medium">{formatPrice(row.input)}</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.cached === null ? <span className="text-muted-foreground">—</span> : <span className="font-medium">{formatPrice(row.cached)}</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.output === null ? <span className="text-muted-foreground">—</span> : <span className="font-medium">{formatPrice(row.output)}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyTier({ tier }: { tier: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">
        No <span className="font-medium text-foreground">{tier}</span> tier pricing data provided.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Only Standard tier prices are listed in the supplied reference.
      </p>
    </div>
  );
}

export default function AdminModels() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OpenAI Model Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reference list of every OpenAI model endpoint and per-1M-token price.
          </p>
        </div>
      </div>

      <Tabs defaultValue="Standard" className="w-full">
        <TabsList>
          {TIERS.map((tier) => (
            <TabsTrigger key={tier} value={tier}>
              {tier}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Standard" className="space-y-8 mt-6">
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Flagship models</h2>
              <p className="text-xs text-muted-foreground">Our latest models. Prices per 1M tokens.</p>
            </div>
            <FlagshipTable />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Regional processing (data residency) endpoints are charged a 10% uplift for{" "}
              {RESIDENCY_MODELS.map((m, i) => (
                <span key={m}>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{m}</code>
                  {i < RESIDENCY_MODELS.length - 1 ? ", " : ""}
                  {i === RESIDENCY_MODELS.length - 2 ? "and " : ""}
                </span>
              ))}
              .
            </p>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Other models</h2>
              <p className="text-xs text-muted-foreground">Prices per 1M tokens.</p>
            </div>
            <OtherModelsTable />
          </section>
        </TabsContent>

        {(["Batch", "Flex", "Priority"] as const).map((tier) => (
          <TabsContent key={tier} value={tier} className="mt-6">
            <EmptyTier tier={tier} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}