// Shipa — the admin integrations configuration page.
//
// What this page is
// -----------------
// One configuration card for the Shipa delivery integration: the enable
// switch, the two dispatch modes, the active environment, the per-environment
// non-secret draft, the API key and the readiness facts.
//
// What this page deliberately does not do
// ---------------------------------------
// * It never books a shipment, never cancels one and never touches a payment.
//   The five configuration actions are the whole surface.
// * It never invents remote state. A heartbeat, an approval, a merchant
//   entitlement and a readiness fact are only ever what the server returned.
// * It never persists a secret. The API key lives in one transient string and is
//   cleared when the request finishes, when the environment changes and when
//   the page is reloaded.
// * It never silently disables anything. Disabling stays reachable even when
//   the scheduler, the key or the runtime is missing.

import type { ReactNode } from "react";
import { Loader2, Plug, RefreshCw, ShieldAlert } from "lucide-react";
import { AdminGlassCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { ShipaCredentialPanel } from "@/components/admin/ShipaCredentialPanel";
import {
  ShipaConfirmationDialogs,
  ShipaEnvironmentFields,
  ShipaEnvironmentPicker,
} from "@/components/admin/ShipaEnvironmentFields";
import {
  ShipaIntegrationControls,
  ShipaReadinessPanel,
  ShipaStatusBadges,
} from "@/components/admin/ShipaReadinessPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useShipaConfiguration } from "@/hooks/useShipaConfiguration";
import { CUREMED_PICKUP_PATCH } from "@/lib/shipaAdminPolicy";

export default function AdminIntegrations() {
  const {
    settingsState,
    readinessState,
    saved: storedSaved,
    draft: storedDraft,
    editorEnvironment,
    apiKeyText,
    removeConfirmOpen,
    liveDialogOpen,
    reloadDialogOpen,
    pending,
    status,
    errorMessage,
    conflict,
    probeNotice,
    readinessPending,
    validationErrors,
    dirty,
    readiness,
    heartbeatCurrent,
    automaticAlreadyEnabled,
    activationIssues,
    busy,
    editorDraft,
    editorSettings,
    editorCredential,
    settingsErrorMessage,
    settingsFailed,
    probeDisabledReason,
    setReloadDialogOpen,
    setDraft,
    setApiKeyText,
    setRemoveConfirmOpen,
    setLiveDialogOpen,
    loadSettings,
    refreshReadiness,
    requestSave,
    onSaveKey,
    onRemoveKey,
    confirmLiveSave,
    requestProbe,
    requestReload,
    patchEnvironment,
    updateEditor,
    changeEditorEnvironment,
  } = useShipaConfiguration();
  // A failed read confirms nothing. The hook keeps the last copy so an
  // unsaved edit is not lost, but the page shows no stored value as current.
  const saved = settingsFailed ? null : storedSaved;
  const draft = settingsFailed ? null : storedDraft;

  return (
    <AdminPageShell
      title="Integrations"
      subtitle="Configure the Shipa delivery integration. This page changes configuration only — it never books a shipment."
      eyebrow="Integrations"
      eyebrowIcon={Plug}
      gradient="emerald-teal-cyan"
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => setReloadDialogOpen(true)}
          disabled={busy || draft === null}
        >
          {pending === "reload"
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <RefreshCw className="mr-2 h-4 w-4" />}
          Reload
        </Button>
      }
    >
      <div className="space-y-6">
        {(settingsFailed || errorMessage !== null) && (
          <Notice
            title={settingsFailed
              ? "The Shipa configuration could not be read"
              : conflict
              ? "Nothing was saved"
              : "The request could not be confirmed"}
          >
            <p>{settingsFailed ? settingsErrorMessage : errorMessage}</p>
            {settingsFailed && (
              <>
                <p className="mt-2">
                  Nothing is shown as configured, because nothing could be confirmed. Try again.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadSettings()}
                  disabled={busy}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </>
            )}
            {conflict && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setReloadDialogOpen(true)}
              >
                Reload the stored configuration
              </Button>
            )}
          </Notice>
        )}

        {status !== null && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-border p-3 text-sm"
          >
            {status}
          </div>
        )}

        {automaticAlreadyEnabled && !heartbeatCurrent && (
          <Notice tone="warning" title="The scheduler receipt is not current">
            Automatic dispatch stays enabled exactly as it is saved. Work that is already queued
            keeps waiting and is dispatched once the scheduler runs again — nothing is cancelled and
            nothing is silently switched off.
          </Notice>
        )}

        <AdminGlassCard
          title="Shipa delivery"
          gradient="emerald-teal-cyan"
          action={<ShipaStatusBadges settings={saved} />}
        >
          {draft === null
            ? (
              settingsFailed
                ? (
                  <p className="text-sm text-muted-foreground">
                    Configuration is unavailable. Retry the read above.
                  </p>
                )
                : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading the Shipa configuration…
                  </div>
                )
            )
            : (
              <div className="space-y-8">
                <ShipaIntegrationControls
                  enabled={draft.enabled}
                  dispatchMode={draft.dispatchMode}
                  environment={draft.environment}
                  activationIssues={activationIssues}
                  busy={busy}
                  savePending={pending === "save"}
                  dirty={dirty}
                  saveDisabled={busy || activationIssues.length > 0}
                  onEnabledChange={(enabled) =>
                    setDraft((current) => (current === null ? current : { ...current, enabled }))}
                  onDispatchModeChange={(dispatchMode) =>
                    setDraft((
                      current,
                    ) => (current === null ? current : { ...current, dispatchMode }))}
                  onEnvironmentChange={(environment) => {
                    setApiKeyText("");
                    setRemoveConfirmOpen(false);
                    setDraft((
                      current,
                    ) => (current === null ? current : { ...current, environment }));
                  }}
                  onSave={() => requestSave()}
                />

                <section className="space-y-5 border-t border-border pt-6">
                  <h3 className="text-sm font-semibold">Environment configuration</h3>
                  <ShipaEnvironmentPicker
                    environment={editorEnvironment}
                    busy={busy}
                    onChange={changeEditorEnvironment}
                  />
                  <ShipaEnvironmentFields
                    environment={editorEnvironment}
                    value={editorSettings ?? draft[editorEnvironment].settings}
                    weightText={editorDraft?.weightText ?? ""}
                    dimensionsText={{
                      lengthCm: editorDraft?.lengthText ?? "",
                      widthCm: editorDraft?.widthText ?? "",
                      heightCm: editorDraft?.heightText ?? "",
                    }}
                    errors={validationErrors}
                    disabled={busy}
                    onPatch={(patch) => patchEnvironment(editorEnvironment, patch)}
                    onWeightText={(weightText) =>
                      updateEditor((target) => ({ ...target, weightText }))}
                    onDimensionsText={(text) =>
                      updateEditor((target) => ({
                        ...target,
                        lengthText: text.lengthCm,
                        widthText: text.widthCm,
                        heightText: text.heightCm,
                      }))}
                    onApplyCuremedPickup={() =>
                      patchEnvironment(editorEnvironment, CUREMED_PICKUP_PATCH)}
                  />
                </section>

                {editorCredential !== null && (
                  <section className="space-y-4 border-t border-border pt-6">
                    <h3 className="text-sm font-semibold">API key</h3>
                    <ShipaCredentialPanel
                      environment={editorEnvironment}
                      credential={editorCredential}
                      apiKeyText={apiKeyText}
                      busy={busy}
                      removeConfirmOpen={removeConfirmOpen}
                      onRemoveConfirmOpenChange={setRemoveConfirmOpen}
                      onApiKeyText={setApiKeyText}
                      onSaveKey={onSaveKey}
                      onRemoveKey={onRemoveKey}
                    />
                  </section>
                )}

                <section className="space-y-4 border-t border-border pt-6">
                  <h3 className="text-sm font-semibold">Readiness and verification</h3>
                  <ShipaReadinessPanel
                    state={readinessState.status}
                    readiness={readiness}
                    errorMessage={readinessState.status === "error" ? readinessState.message : null}
                    environment={editorEnvironment}
                    probeDisabled={busy || readinessPending || dirty || apiKeyText.trim() !== "" ||
                      saved === null}
                    refreshPending={busy || readinessPending}
                    probeDisabledReason={probeDisabledReason}
                    probePending={pending === "probe"}
                    probeNotice={probeNotice}
                    onProbe={() => void requestProbe()}
                    onRetry={() => void refreshReadiness()}
                  />
                  {readinessPending && (
                    <p className="text-xs text-muted-foreground">Refreshing the readiness facts…</p>
                  )}
                </section>
              </div>
            )}
        </AdminGlassCard>
      </div>

      <ShipaConfirmationDialogs
        liveOpen={liveDialogOpen}
        liveMode={draft?.dispatchMode ?? "manual_after_packing"}
        onLiveOpenChange={setLiveDialogOpen}
        onConfirmLive={confirmLiveSave}
        reloadOpen={reloadDialogOpen}
        onReloadOpenChange={setReloadDialogOpen}
        onConfirmReload={() => void requestReload()}
      />
    </AdminPageShell>
  );
}

/** One bounded message region. */
function Notice({
  title,
  children,
  tone = "error",
}: {
  title: string;
  children: ReactNode;
  tone?: "error" | "warning";
}) {
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"}>
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
