// The input is an actual marker-guarded SQL preparation with synthetic data.
// No fetch, environment access, private credential or internal mock is used.
import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  buildShipaOrderPayload,
  isShipaEnvironment,
} from "../../functions/_shared/shipa-contract.ts";
import {
  isIntegrationUuid,
  isPlainRecord,
} from "../../functions/_shared/integration-credential-contract.ts";
import { parseShipaSubmissionPreparation } from "../../functions/_shared/shipa-submission-responses.ts";

let input = "";
for await (
  const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())
) {
  input += chunk;
}
const document: unknown = JSON.parse(input);
if (
  !isPlainRecord(document) || !isIntegrationUuid(document.shipment_id) ||
  !isIntegrationUuid(document.integration_id) ||
  !isShipaEnvironment(document.environment)
) {
  throw new Error("SQL payload proof requires a valid fixture binding");
}
const preparation = parseShipaSubmissionPreparation(document, {
  shipmentId: document.shipment_id,
  integrationId: document.integration_id,
  environment: document.environment,
});
assertEquals(preparation.ready, true);
const built = buildShipaOrderPayload(preparation.draft);
assertEquals(built.ok, true);
if (!built.ok) {
  throw new Error("SQL draft did not pass the actual Shipa builder");
}
assertEquals<unknown>(built.payload, preparation.payload);
assertEquals(built.payload.destination.options.amountToCollect, 0);
assertEquals(built.payload.origin.country, "KWT");
assertEquals(built.payload.destination.country, "KWT");
console.log("SQL preparation matches the actual Shipa request builder");
