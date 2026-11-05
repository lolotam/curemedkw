import { authorizeShipaWorker, type ShipaWorkerCredentials } from "../_shared/shipa-auth.ts";
import { createShipaDispatcher } from "../_shared/shipa-dispatch.ts";
import { createShipaRuntimeServices, type ShipaRuntimeClient } from "../_shared/shipa-runtime.ts";
import { isIntegrationUuid, isPlainRecord } from "../_shared/integration-credential-contract.ts";
import { isShipaEnvironment } from "../_shared/shipa-contract.ts";
import type { ShipaFetch } from "../_shared/shipa-client.ts";

interface DispatchOptions {
  client: ShipaRuntimeClient;
  credentials: ShipaWorkerCredentials;
  readEncryptionKey: () => string | undefined;
  verifyPendingPayments: () => Promise<void>;
  fetchImpl?: ShipaFetch;
}

async function dispatchRpc(client: ShipaRuntimeClient, name: string, args?: Record<string, unknown>) {
  const response = await client.rpc(name, args);
  if (!isPlainRecord(response) || response.error) throw new Error("dispatch_storage_unavailable");
  return response.data;
}

export function createShipaDispatchHandler(options: DispatchOptions) {
  const runtime = createShipaRuntimeServices(options);
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return Response.json({ code: "method_not_allowed" }, { status: 405 });
    const authorization = authorizeShipaWorker(request, options.credentials);
    if (!authorization.ok) return Response.json({ code: authorization.code }, { status: 401 });
    try {
      let paymentVerificationPending = false;
      try { await options.verifyPendingPayments(); }
      catch { paymentVerificationPending = true; }
      const context = await dispatchRpc(options.client, "shipa_worker_context");
      if (!isPlainRecord(context) || !isShipaEnvironment(context.environment) ||
        typeof context.credential_fingerprint !== "string") {
        return Response.json({ success: true, shipa: "not_configured", paymentVerificationPending });
      }
      const dispatcher = createShipaDispatcher({ ...options, keyring: await runtime.requireKeyring() });
      await dispatchRpc(options.client, "shipa_expire_leases");
      const candidates = await dispatchRpc(options.client, "shipa_select_dispatch_candidates", { _limit: 3 });
      if (!Array.isArray(candidates) || candidates.length > 3) throw new Error("invalid_candidates");
      const outcomes = [];
      for (const candidate of candidates) {
        if (!isPlainRecord(candidate) || !isIntegrationUuid(candidate.shipment_id) ||
          !isIntegrationUuid(candidate.integration_id) || !isShipaEnvironment(candidate.environment)) {
          throw new Error("invalid_candidates");
        }
        outcomes.push(await dispatcher.processShipment({ shipmentId: candidate.shipment_id,
          integrationId: candidate.integration_id, environment: candidate.environment }));
      }
      // Only the dedicated scheduler credential can advance automatic readiness.
      if (authorization.source === "scheduler") {
        await dispatchRpc(options.client, "shipa_record_scheduler_ok", { _run_id: crypto.randomUUID(),
          _environment: context.environment, _credential_fingerprint: context.credential_fingerprint });
      }
      return Response.json({ success: true, outcomes, paymentVerificationPending }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Database/provider errors can contain credentials or customer fields.
      return Response.json({ code: "dispatch_unavailable" }, { status: 503 });
    }
  };
}
