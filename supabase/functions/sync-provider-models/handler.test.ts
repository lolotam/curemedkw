import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createModelSyncHandler } from "./handler.ts";
import { withModelCatalogAuth } from "../_shared/model-catalog-auth.ts";

const actor = "87000000-0000-4000-8000-000000000001";
function fixture(options: { admin?: boolean; providerFails?: boolean; storageFails?: boolean; empty?: boolean } = {}) {
  const writes: unknown[] = [];
  const calls: string[] = [];
  const model = { id: "fixture-new-model", name: "New model", kind: "chat", context_length: 100000, pricing: null };
  const client = createClient("https://fixture.supabase.test", "fixture-service", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      calls.push(path);
      if (path === "/auth/v1/user") return Response.json({ id: actor });
      if (path === "/rest/v1/user_roles") return Response.json(options.admin === false ? [] : [{ role: "admin" }]);
      if (path === "/functions/v1/openai-models") return options.providerFails
        ? Response.json({ error: "secret-provider-details" }, { status: 502 })
        : Response.json({ models: options.empty ? [] : [model, model] });
      if (path === "/rest/v1/site_settings") {
        writes.push(await request.json());
        return options.storageFails ? Response.json({ message: "secret-database-details" }, { status: 400 }) : new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected transport: ${path}`);
    } },
  });
  const handler = createModelSyncHandler(client);
  return { writes, calls, request: (body: unknown, authenticated = true, raw = false) => handler(new Request("https://fixture.test/sync", {
    method: "POST", headers: authenticated ? { authorization: "Bearer fixture-user" } : {}, body: raw ? String(body) : JSON.stringify(body),
  })) };
}

Deno.test("model sync refuses anonymous and non-admin requests before provider or storage access", async () => {
  const anonymous = fixture();
  assertEquals((await anonymous.request({ provider: "openai" }, false)).status, 401);
  assertEquals(anonymous.calls, []);
  const ordinary = fixture({ admin: false });
  assertEquals((await ordinary.request({ provider: "openai" })).status, 403);
  assertEquals(ordinary.calls, ["/auth/v1/user", "/rest/v1/user_roles"]);
});

Deno.test("empty and malformed JSON are client errors without provider or storage access", async () => {
  for (const body of ["", "   ", "{", '{"provider":']) {
    const test = fixture();
    const response = await test.request(body, true, true);
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, "invalid_request");
    assertEquals(test.calls, ["/auth/v1/user", "/rest/v1/user_roles"]);
    assertEquals(test.writes, []);
  }
});

Deno.test("model sync fetches the provider and persists a deduplicated catalog before success", async () => {
  const test = fixture();
  const response = await test.request({ provider: "openai" });
  assertEquals(response.status, 200);
  assertEquals((await response.json()).count, 1);
  assertEquals(test.writes.length, 1);
  const saved = test.writes[0] as { key: string; value: { models: unknown[]; syncedAt: string } };
  assertEquals(saved.key, "ai_provider_models_openai");
  assertEquals(saved.value.models.length, 1);
  assertEquals(Number.isFinite(Date.parse(saved.value.syncedAt)), true);
});

Deno.test("failed or empty provider responses preserve the saved catalog", async () => {
  for (const options of [{ providerFails: true }, { empty: true }]) {
    const test = fixture(options);
    const response = await test.request({ provider: "openai" });
    assertEquals(response.status, 502);
    assertEquals(test.writes, []);
    assertEquals((await response.text()).includes("secret-provider-details"), false);
  }
});

Deno.test("storage failures and arbitrary provider destinations cannot report sync success", async () => {
  const test = fixture({ storageFails: true });
  assertEquals((await test.request({ provider: "openai" })).status, 503);
  const invalid = fixture();
  assertEquals((await invalid.request({ provider: "https://foreign.test" })).status, 400);
  assertEquals(invalid.writes, []);
  assertEquals(invalid.calls.length, 2);
});

Deno.test("provider adapters authorize locally even when the runtime does not enforce JWT", async () => {
  for (const scenario of ["anonymous", "ordinary", "admin", "service"]) {
    let providerCalls = 0;
    let authCalls = 0;
    const admin = createClient("https://fixture.supabase.test", "fixture-key", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input) => {
        authCalls++;
        const path = new URL(String(input)).pathname;
        if (path === "/auth/v1/user") return Promise.resolve(Response.json({ id: actor }));
        if (path === "/rest/v1/user_roles") return Promise.resolve(Response.json(scenario === "admin" ? [{ role: "admin" }] : []));
        throw new Error("Unexpected auth request");
      } },
    });
    const handler = withModelCatalogAuth(() => {
      providerCalls++; return Promise.resolve(Response.json({ models: [] }));
    }, { getAdmin: () => admin, readServiceKey: () => "fixture-service" });
    const headers: Record<string, string> = scenario === "anonymous" ? {} : { authorization: `Bearer ${scenario === "service" ? "fixture-service" : "fixture-user"}` };
    const response = await handler(new Request("https://fixture.test/models", { headers }));
    assertEquals(response.status, scenario === "anonymous" ? 401 : scenario === "ordinary" ? 403 : 200);
    assertEquals(providerCalls, ["admin", "service"].includes(scenario) ? 1 : 0);
    assertEquals(authCalls, ["anonymous", "service"].includes(scenario) ? 0 : 2);
  }
});
