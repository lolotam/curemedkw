// Shipa configuration state stays transient and is shared only with its page.
// Extracted from AdminIntegrations to keep the editor and async orchestration separate.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  describeShipaProbeOutcome,
  isShipaSchedulerCurrent,
  shipaAutomaticActivationIssues,
} from "@/lib/shipaAdminPolicy";
import {
  buildShipaSaveableSettings,
  draftFromShipaSettings,
  shipaAdminClient,
  type ShipaAdminCredentialOperation,
  type ShipaAdminErrorCode,
  type ShipaAdminSaveRequest,
  type ShipaDraft,
} from "@/lib/shipaAdmin";
import type { ShipaReadinessDto, ShipaSettingsEnvelopeDto } from "@/lib/shipaAdminResponses";
import {
  applyShipaPublicSettingsPatch,
  parseShipaSaveRequest,
  type ShipaEnvironment,
  type ShipaPublicSettingsPatch,
  type ShipaSettings,
} from "@/lib/shipaSettings";

/** The state of one read. */
type LoadState<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "error"; readonly code: ShipaAdminErrorCode; readonly message: string };

const CONFLICT_MESSAGE =
  "The Shipa configuration changed somewhere else, so nothing was saved. Your unsaved edits are still here — reload to take the stored configuration, then reapply what you need.";

const UNAVAILABLE_MESSAGE = "The Shipa configuration service is not available right now.";

export function useShipaConfiguration() {
  const [settingsState, setSettingsState] = useState<LoadState<ShipaSettingsEnvelopeDto>>({
    status: "loading",
  });
  const [readinessState, setReadinessState] = useState<LoadState<ShipaReadinessDto>>({
    status: "loading",
  });
  const [saved, setSaved] = useState<ShipaSettings | null>(null);
  const [draft, setDraft] = useState<ShipaDraft | null>(null);
  const [editorEnvironment, setEditorEnvironment] = useState<ShipaEnvironment>("sandbox");
  const [apiKeyText, setApiKeyText] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [liveDialogOpen, updateLiveDialogOpen] = useState(false);
  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  const [pendingCredential, setPendingCredential] = useState<
    Pick<ShipaAdminCredentialOperation, "environment" | "mode"> | null
  >(
    null,
  );
  const [pending, setPending] = useState<null | "save" | "probe" | "reload">(null);
  const [readinessPending, setReadinessPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [probeNotice, setProbeNotice] = useState<string | null>(null);

  const setLiveDialogOpen = useCallback((open: boolean) => {
    updateLiveDialogOpen(open);
    if (!open) {
      setPendingCredential(null);
      setApiKeyText("");
    }
  }, []);

  const mountedRef = useRef(true);
  const settingsSequenceRef = useRef(0);
  const readinessSequenceRef = useRef(0);
  const operationRef = useRef<"save" | "probe" | "reload" | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(clock);
  }, []);

  // --- the reads ---

  const loadSettings = useCallback(async (): Promise<boolean> => {
    const sequence = ++settingsSequenceRef.current;
    setSettingsState({ status: "loading" });
    try {
      const result = await shipaAdminClient.readSettings();
      if (!mountedRef.current || sequence !== settingsSequenceRef.current) return false;
      if (result.ok === false) {
        setSaved(null);
        setDraft(null);
        setSettingsState({ status: "error", code: result.code, message: result.message });
        return false;
      }
      setSaved(result.data.settings);
      setDraft(draftFromShipaSettings(result.data.settings));
      setEditorEnvironment(result.data.settings.environment);
      setSettingsState({ status: "ready", data: result.data });
      return true;
    } catch {
      if (!mountedRef.current || sequence !== settingsSequenceRef.current) return false;
      setSaved(null);
      setDraft(null);
      setSettingsState({ status: "error", code: "unavailable", message: UNAVAILABLE_MESSAGE });
      return false;
    }
  }, []);

  const refreshReadiness = useCallback(async () => {
    const sequence = ++readinessSequenceRef.current;
    setReadinessPending(true);
    try {
      const result = await shipaAdminClient.readReadiness();
      if (!mountedRef.current || sequence !== readinessSequenceRef.current) return;
      if (result.ok === false) {
        setReadinessState({ status: "error", code: result.code, message: result.message });
        return;
      }
      setReadinessState({ status: "ready", data: result.data });
    } catch {
      if (!mountedRef.current || sequence !== readinessSequenceRef.current) return;
      setReadinessState({ status: "error", code: "unavailable", message: UNAVAILABLE_MESSAGE });
    } finally {
      if (mountedRef.current && sequence === readinessSequenceRef.current) {
        setReadinessPending(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void refreshReadiness();
  }, [loadSettings, refreshReadiness]);

  // --- the derived state ---

  const built = useMemo(() => (draft === null ? null : buildShipaSaveableSettings(draft)), [draft]);
  const validationErrors = built !== null && built.ok === false ? built.errors : [];
  const dirty = useMemo(() => {
    if (built === null || saved === null) return false;
    if (!built.ok) return true;
    const stored = buildShipaSaveableSettings(draftFromShipaSettings(saved));
    return !stored.ok || JSON.stringify(built.settings) !== JSON.stringify(stored.settings);
  }, [built, saved]);

  const readiness = readinessState.status === "ready" ? readinessState.data : null;
  const heartbeatCurrent = readiness !== null && isShipaSchedulerCurrent(readiness, nowMs);
  const automaticAlreadyEnabled = saved !== null && saved.enabled &&
    saved.dispatchMode === "automatic_after_payment";

  const activationContext = useMemo(() => ({
    draft,
    saved,
    built,
    readiness: readinessPending ? null : readiness,
    newKeyPending: apiKeyText.trim() !== "",
    nowMs,
  }), [draft, saved, built, readinessPending, readiness, apiKeyText, nowMs]);
  const activationIssues = shipaAutomaticActivationIssues(activationContext);

  const liveConfirmationRequired = draft !== null &&
    saved !== null &&
    draft.enabled &&
    draft.environment === "live" &&
    !(saved.enabled && saved.environment === "live");
  const busy = pending !== null;

  // --- the writes ---

  const runSave = useCallback(
    async (request: ShipaAdminSaveRequest, credential: ShipaAdminCredentialOperation | null) => {
      if (operationRef.current !== null) return;
      operationRef.current = "save";
      setPending("save");
      setErrorMessage(null);
      setStatus(null);
      setConflict(false);
      try {
        const result = credential
          ? await shipaAdminClient.saveCredential({ ...request, credential })
          : await shipaAdminClient.saveSettings(request);
        if (!mountedRef.current) return;
        setApiKeyText("");
        setRemoveConfirmOpen(false);
        if (result.ok === false) {
          setConflict(result.code === "conflict");
          setErrorMessage(result.code === "conflict" ? CONFLICT_MESSAGE : result.message);
          return;
        }
        setSaved(result.data.settings);
        setDraft(draftFromShipaSettings(result.data.settings));
        setStatus("The Shipa configuration was saved.");
        void refreshReadiness();
      } catch {
        if (mountedRef.current) {
          setErrorMessage("The save result could not be confirmed. Reload before trying again.");
        }
      } finally {
        operationRef.current = null;
        if (mountedRef.current) {
          setApiKeyText("");
          setPending(null);
        }
      }
    },
    [refreshReadiness],
  );

  const prepareRequest = useCallback((): ShipaAdminSaveRequest | null => {
    if (draft === null || saved === null) return null;
    const build = buildShipaSaveableSettings(draft);
    if (build.ok === false) {
      setApiKeyText("");
      setErrorMessage(build.errors.join(" "));
      return null;
    }
    const parsed = parseShipaSaveRequest({
      expectedRevision: saved.revision,
      settings: build.settings,
    });
    if (!parsed.ok || parsed.request === undefined) {
      setApiKeyText("");
      setErrorMessage("The Shipa configuration could not be validated. Nothing was changed.");
      return null;
    }
    return {
      expectedRevision: parsed.request.expectedRevision,
      settings: parsed.request.settings,
    };
  }, [draft, saved]);

  /** Saves the configuration, optionally with one credential operation. */
  const requestSave = useCallback(
    (credential: ShipaAdminCredentialOperation | null = null) => {
      if (operationRef.current !== null) return;
      const request = prepareRequest();
      if (request === null) return;
      const currentIssues = shipaAutomaticActivationIssues({
        ...activationContext,
        nowMs: Date.now(),
      });
      if (currentIssues.length > 0) {
        setApiKeyText("");
        setErrorMessage(currentIssues.join(" "));
        return;
      }
      const selectedCredential = credential ?? (apiKeyText.trim() === "" ? null : {
        environment: editorEnvironment,
        mode: "replace" as const,
        apiKey: apiKeyText,
      });
      if (liveConfirmationRequired) {
        setPendingCredential(
          selectedCredential === null
            ? null
            : { environment: selectedCredential.environment, mode: selectedCredential.mode },
        );
        setLiveDialogOpen(true);
        return;
      }
      void runSave(request, selectedCredential);
    },
    [
      prepareRequest,
      activationContext,
      liveConfirmationRequired,
      runSave,
      setLiveDialogOpen,
      apiKeyText,
      editorEnvironment,
    ],
  );

  const onSaveKey = useCallback(() => {
    requestSave(
      apiKeyText.trim() === ""
        ? { environment: editorEnvironment, mode: "preserve" }
        : { environment: editorEnvironment, mode: "replace", apiKey: apiKeyText },
    );
  }, [requestSave, apiKeyText, editorEnvironment]);

  const onRemoveKey = useCallback(() => {
    requestSave({ environment: editorEnvironment, mode: "remove" });
  }, [requestSave, editorEnvironment]);

  const confirmLiveSave = useCallback(() => {
    setLiveDialogOpen(false);
    const currentIssues = shipaAutomaticActivationIssues({
      ...activationContext,
      nowMs: Date.now(),
    });
    if (currentIssues.length > 0) {
      setErrorMessage(currentIssues.join(" "));
      return;
    }
    const request = prepareRequest();
    if (request === null) return;
    const credential: ShipaAdminCredentialOperation | null = pendingCredential === null
      ? null
      : pendingCredential.mode === "replace"
      ? { environment: pendingCredential.environment, mode: "replace", apiKey: apiKeyText }
      : pendingCredential.mode === "remove"
      ? { environment: pendingCredential.environment, mode: "remove" }
      : { environment: pendingCredential.environment, mode: "preserve" };
    setPendingCredential(null);
    void runSave(request, credential);
  }, [
    prepareRequest,
    pendingCredential,
    apiKeyText,
    runSave,
    setLiveDialogOpen,
    activationContext,
  ]);

  const requestProbe = useCallback(async () => {
    if (
      saved === null || operationRef.current !== null || readinessPending || dirty ||
      apiKeyText.trim() !== ""
    ) return;
    operationRef.current = "probe";
    const sequence = ++readinessSequenceRef.current;
    setReadinessPending(true);
    setPending("probe");
    setErrorMessage(null);
    setProbeNotice(null);
    try {
      const result = await shipaAdminClient.diagnoseReadiness({
        expectedRevision: saved.revision,
        environment: editorEnvironment,
      });
      if (!mountedRef.current || sequence !== readinessSequenceRef.current) return;
      if (result.ok === false) {
        setErrorMessage(result.message);
        return;
      }
      setReadinessState({ status: "ready", data: result.data });
      setProbeNotice(
        describeShipaProbeOutcome(editorEnvironment, result.data.environments[editorEnvironment]),
      );
    } catch {
      if (mountedRef.current && sequence === readinessSequenceRef.current) {
        setErrorMessage(UNAVAILABLE_MESSAGE);
      }
    } finally {
      operationRef.current = null;
      if (mountedRef.current) {
        setPending(null);
        if (sequence === readinessSequenceRef.current) setReadinessPending(false);
      }
    }
  }, [saved, editorEnvironment, readinessPending, dirty, apiKeyText]);

  const requestReload = useCallback(async () => {
    if (operationRef.current !== null) return;
    operationRef.current = "reload";
    setReloadDialogOpen(false);
    setPending("reload");
    setConflict(false);
    setErrorMessage(null);
    setStatus(null);
    setApiKeyText("");
    try {
      const loaded = await loadSettings();
      if (loaded) await refreshReadiness();
      if (mountedRef.current && loaded) setStatus("The stored Shipa configuration was reloaded.");
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setPending(null);
    }
  }, [loadSettings, refreshReadiness]);

  // --- the draft edits ---

  const patchEnvironment = useCallback(
    (environment: ShipaEnvironment, patch: ShipaPublicSettingsPatch) => {
      setDraft((current) => {
        if (current === null) return current;
        const target = current[environment];
        return {
          ...current,
          [environment]: {
            ...target,
            settings: applyShipaPublicSettingsPatch(target.settings, patch),
          },
        };
      });
    },
    [],
  );

  const updateEditor = useCallback(
    (update: (draft: ShipaDraft["sandbox"]) => ShipaDraft["sandbox"]) => {
      setDraft((current) => {
        if (current === null) return current;
        return { ...current, [editorEnvironment]: update(current[editorEnvironment]) };
      });
    },
    [editorEnvironment],
  );

  const changeEditorEnvironment = useCallback((next: ShipaEnvironment) => {
    setEditorEnvironment(next);
    setApiKeyText("");
    setRemoveConfirmOpen(false);
  }, []);

  // --- the render ---

  const editorDraft = draft === null ? null : draft[editorEnvironment];
  const editorSettings = editorDraft === null ? null : editorDraft.settings;
  const editorCredential = saved === null ? null : saved[editorEnvironment].credential;
  const settingsErrorMessage = settingsState.status === "error" ? settingsState.message : null;
  const settingsFailed = settingsErrorMessage !== null;
  const probeDisabledReason = dirty || apiKeyText.trim() !== ""
    ? "Save your changes first: a connection check reads the stored configuration at the saved revision."
    : null;

  return {
    settingsState,
    readinessState,
    saved,
    draft,
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
  };
}
