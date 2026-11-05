import { getAdminClient } from "../_shared/supabase-admin.ts";
import { createShipaRuntimeClient } from "../_shared/shipa-runtime.ts";
import { createShipaDispatchHandler } from "./handler.ts";
import { verifyPendingIntegrationPayment } from "../_shared/integration-payment.ts";

const admin = getAdminClient();
const env = (name: string) => Deno.env.get(name) ?? "";

Deno.serve(createShipaDispatchHandler({
  client: createShipaRuntimeClient(admin),
  verifyPendingPayments: () => verifyPendingIntegrationPayment(admin),
  readEncryptionKey: () => Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY_V1"),
  credentials: { serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    schedulerToken: env("SHIPA_DISPATCH_TOKEN") },
}));
