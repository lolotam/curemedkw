// Shipa — the status, readiness and activation panel.
//
// What this module owns
// ---------------------
//   1. The readiness facts of the integration and of the two environments.
//      Every flag is an observation, never activation permission, and the
//      merchant entitlement stays the literal "unconfirmed".
//   2. The integration controls: the enable switch, the two dispatch modes,
//      the active environment and the save action. They belong with the
//      status, because they are exactly what the readiness facts depend on.
//   3. The displayed server facts used alongside the UI activation policy.
//
// A provider probe uses GET; CureMed records its observation. It never creates, retries or books a shipment, and it
// never claims that delivery is healthy when the facts say otherwise.

import { AlertTriangle, Loader2, RefreshCw, Save, Stethoscope } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import type { ShipaEnvironmentReadinessDto, ShipaReadinessDto } from "@/lib/shipaAdminResponses";
import { type DispatchMode, type ShipaEnvironment, type ShipaSettings } from "@/lib/shipaSettings";

// ---------------------------------------------------------------------------
// The status summary
// ---------------------------------------------------------------------------

export interface ShipaStatusBadgesProps {
  readonly settings: ShipaSettings | null;
}

/** The saved enabled state, active environment, mode and revision. */
export function ShipaStatusBadges({ settings }: ShipaStatusBadgesProps) {
  if (settings === null) return <Badge variant="outline">Configuration not loaded</Badge>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={settings?.enabled ? "default" : "outline"}>
        {settings?.enabled ? "Enabled" : "Disabled"}
      </Badge>
      <Badge variant="secondary">
        Active: {settings?.environment === "live" ? "Live" : "Sandbox"}
      </Badge>
      <Badge variant="outline">
        {settings?.dispatchMode === "automatic_after_payment" ? "Automatic" : "Manual"}
      </Badge>
      <Badge variant="outline">Revision {settings?.revision ?? "—"}</Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The integration controls
// ---------------------------------------------------------------------------

export interface ShipaIntegrationControlsProps {
  readonly enabled: boolean;
  readonly dispatchMode: DispatchMode;
  readonly environment: ShipaEnvironment;
  /** Why a new automatic enablement is refused. Empty when it is allowed. */
  readonly activationIssues: readonly string[];
  /** True while a request is running. */
  readonly busy: boolean;
  /** True while the configuration is being saved. */
  readonly savePending: boolean;
  /** True when the draft differs from the saved configuration. */
  readonly dirty: boolean;
  /** True when the configuration cannot be saved right now. */
  readonly saveDisabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onDispatchModeChange: (mode: DispatchMode) => void;
  readonly onEnvironmentChange: (environment: ShipaEnvironment) => void;
  /** Saves the configuration. */
  readonly onSave: () => void;
}

/**
 * The enable switch, the two dispatch modes, the active environment and the
 * save action.
 *
 * The enable switch starts from the saved server state, and turning it off
 * stays available even when the scheduler, the key or the runtime is missing.
 */
export function ShipaIntegrationControls({
  enabled,
  dispatchMode,
  environment,
  activationIssues,
  busy,
  savePending,
  dirty,
  saveDisabled,
  onEnabledChange,
  onDispatchModeChange,
  onEnvironmentChange,
  onSave,
}: ShipaIntegrationControlsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <Label htmlFor="shipa-enabled">Enable Shipa delivery</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            The switch starts from the saved server state. Turning it off is always available, even
            when the scheduler, the key or the runtime is missing.
          </p>
        </div>
        <Switch
          id="shipa-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
          disabled={busy}
        />
      </div>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-sm font-semibold">Dispatch mode</legend>
        <RadioGroup
          value={dispatchMode}
          onValueChange={(value) => onDispatchModeChange(value as DispatchMode)}
        >
          <RadioChoice
            value="manual_after_packing"
            title="Manual after packing"
            description="Staff pack, review and book each shipment. Nothing is booked automatically."
          />
          <RadioChoice
            value="automatic_after_payment"
            title="Automatic after verified payment"
            description="Verified successful future payments queue a shipment automatically."
          />
        </RadioGroup>
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Queued work keeps the environment it was queued for. Shipments that already started are
          not cancelled. Switching to automatic does not book orders that were already paid.
        </p>
        {activationIssues.length > 0 && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p className="font-medium">Automatic dispatch cannot be enabled yet:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {activationIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-sm font-semibold">Active environment</legend>
        <p className="text-xs text-muted-foreground">
          The environment new shipments are dispatched in. This is separate from the environment you
          are editing below.
        </p>
        <RadioGroup
          value={environment}
          onValueChange={(value) => onEnvironmentChange(value as ShipaEnvironment)}
        >
          <RadioChoice value="sandbox" title="Sandbox" description="Test shipments only." />
          <RadioChoice
            value="live"
            title="Live"
            description="Real customer shipments. Enabling it asks for a confirmation."
          />
        </RadioGroup>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="bg-brand text-white hover:bg-brand/90"
        >
          {savePending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "Everything is saved"}
        </span>
      </div>
    </div>
  );
}

function RadioChoice({
  value,
  title,
  description,
}: {
  value: string;
  title: string;
  description: string;
}) {
  const id = `shipa-radio-${value}`;
  return (
    <div className="flex items-start gap-3">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="cursor-pointer">
        <span className="font-medium">{title}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {description}
        </span>
      </Label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The readiness panel
// ---------------------------------------------------------------------------

export interface ShipaReadinessPanelProps {
  /** The state of the readiness read. */
  readonly state: "loading" | "ready" | "error";
  /** The readiness projection, when it was read. */
  readonly readiness: ShipaReadinessDto | null;
  /** The fixed message of a failed readiness read. */
  readonly errorMessage: string | null;
  /** The environment a probe would inspect. */
  readonly environment: ShipaEnvironment;
  /** True when a probe cannot run right now. */
  readonly probeDisabled: boolean;
  /** Why a probe cannot run right now. */
  readonly probeDisabledReason: string | null;
  /** True while a probe is running. */
  readonly probePending: boolean;
  /** The outcome of the last probe, in plain words. */
  readonly probeNotice: string | null;
  /** Runs one read-only probe of the selected environment. */
  readonly onProbe: () => void;
  /** Reads the readiness again. */
  readonly onRetry: () => void;
  readonly refreshPending?: boolean;
}

export function ShipaReadinessPanel({
  state,
  readiness,
  errorMessage,
  environment,
  probeDisabled,
  probeDisabledReason,
  probePending,
  probeNotice,
  onProbe,
  onRetry,
  refreshPending = false,
}: ShipaReadinessPanelProps) {
  const environmentLabel = environment === "live" ? "Live" : "Sandbox";

  return (
    <div className="space-y-4">
      {state === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading readiness…
        </div>
      )}

      {state === "error" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Readiness is unavailable</AlertTitle>
          <AlertDescription>
            <p>{errorMessage ?? "The Shipa readiness service is not available right now."}</p>
            <p className="mt-2">
              The saved configuration above is unchanged; only the readiness facts are missing.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRetry}
              disabled={refreshPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Retry readiness
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state === "ready" && readiness !== null && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <EnvironmentFacts
              title="Sandbox"
              facts={readiness.environments.sandbox}
              active={readiness.activeEnvironment === "sandbox"}
            />
            <EnvironmentFacts
              title="Live"
              facts={readiness.environments.live}
              active={readiness.activeEnvironment === "live"}
            />
          </div>
          <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-foreground">Settings revision:</dt>
              <dd className="inline">{readiness.settingsRevision}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Scheduler receipt:</dt>
              <dd className="inline">
                {readiness.scheduler.current ? "current" : "not current"} — last run{" "}
                {readiness.scheduler.lastOkAt ?? "never"}
              </dd>
            </div>
          </dl>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onProbe}
          disabled={probeDisabled || probePending || state !== "ready"}
        >
          {probePending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Stethoscope className="mr-2 h-4 w-4" />}
          Run connection check ({environmentLabel})
        </Button>
        {probeDisabled && probeDisabledReason && (
          <p className="text-xs text-muted-foreground">{probeDisabledReason}</p>
        )}
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {probeNotice ??
          "A connection check is a read of the stored key. It never creates, retries or books a shipment."}
      </p>
    </div>
  );
}

function EnvironmentFacts({
  title,
  facts,
  active,
}: {
  title: string;
  facts: ShipaEnvironmentReadinessDto;
  active: boolean;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {active && <Badge variant="secondary">Active environment</Badge>}
      </div>
      <dl className="space-y-1 text-xs">
        <Fact label="Credential stored" value={facts.credentialPresent ? "yes" : "no"} />
        <Fact label="Configuration ready" value={facts.configurationReady ? "yes" : "no"} />
        <Fact label="Probe current" value={facts.probeCurrent ? "yes" : "no"} />
        <Fact label="Credentials verified" value={facts.credentialsVerified ? "yes" : "no"} />
        <Fact label="Origin city matched" value={facts.originCityMatched ? "yes" : "no"} />
        <Fact label="Last checked" value={facts.lastCheckedAt ?? "never"} />
        <Fact label="Safe code" value={facts.safeCode ?? "none"} />
        <Fact label="Service entitlement" value="UNCONFIRMED" />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
