// The input is an actual marker-guarded SQL preparation with synthetic data.
// No fetch, environment access, private credential or internal mock is used.
import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  buildShipaOrderPayload,
  type ShipaOrderDraft,
  type ShipaOrderPayload,
} from "../../functions/_shared/shipa-contract.ts";

let input = "";
for await (
  const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())
) {
  input += chunk;
}
const preparation = JSON.parse(input) as {
  ready: boolean;
  draft: ShipaOrderDraft;
  payload: ShipaOrderPayload;
};
assertEquals(preparation.ready, true);
const built = buildShipaOrderPayload(preparation.draft);
assertEquals(built.ok, true);
if (!built.ok) {
  throw new Error("SQL draft did not pass the actual Shipa builder");
}
assertEquals(built.payload, preparation.payload);
assertEquals(built.payload.destination.options.amountToCollect, 0);
assertEquals(built.payload.origin.country, "KWT");
assertEquals(built.payload.destination.country, "KWT");
console.log("SQL preparation matches the actual Shipa request builder");
