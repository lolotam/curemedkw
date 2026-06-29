// MyFatoorah v3 API helper. EDGE-FUNCTION ONLY — uses the secret token.
export interface MyFatoorahConfig {
  baseUrl: string;
  token: string;
  currency: string;
  countryIso: string;
  appPublicUrl: string;
  webhookSecret: string;
  mode: string;
}

export function getMyFatoorahConfig(): MyFatoorahConfig {
  const token = Deno.env.get("MYFATOORAH_TOKEN") ?? "";
  const baseUrl = (Deno.env.get("MYFATOORAH_BASE_URL") ?? "https://apitest.myfatoorah.com")
    .replace(/\/+$/, "");
  if (!token) throw new Error("MYFATOORAH_TOKEN is not configured");
  return {
    baseUrl,
    token,
    currency: Deno.env.get("MYFATOORAH_CURRENCY") ?? "KWD",
    countryIso: Deno.env.get("MYFATOORAH_COUNTRY_ISO") ?? "KWT",
    appPublicUrl: (Deno.env.get("APP_PUBLIC_URL") ?? "").replace(/\/+$/, ""),
    webhookSecret: Deno.env.get("MYFATOORAH_WEBHOOK_SECRET") ?? "",
    mode: Deno.env.get("MYFATOORAH_MODE") ?? "test",
  };
}

export interface MyFatoorahResult<T> {
  IsSuccess: boolean;
  Message: string;
  ValidationErrors?: Array<{ Name: string; Error: string }> | null;
  Data: T;
}

export class MyFatoorahError extends Error {
  validationErrors?: unknown;
  constructor(message: string, validationErrors?: unknown) {
    super(message);
    this.name = "MyFatoorahError";
    this.validationErrors = validationErrors;
  }
}

/**
 * Calls the MyFatoorah API. Throws MyFatoorahError on transport/validation
 * failures with a safe message (never leaks the token).
 */
export async function myfatoorahRequest<T>(
  config: MyFatoorahConfig,
  path: string,
  options: {
    method: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
    timeoutMs?: number;
  },
): Promise<MyFatoorahResult<T>> {
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: MyFatoorahResult<T>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new MyFatoorahError(
        `MyFatoorah returned a non-JSON response (HTTP ${res.status})`,
      );
    }
    if (!res.ok || parsed.IsSuccess === false) {
      const msg = parsed?.Message || `MyFatoorah request failed (HTTP ${res.status})`;
      throw new MyFatoorahError(msg, parsed?.ValidationErrors ?? null);
    }
    return parsed;
  } catch (err) {
    if (err instanceof MyFatoorahError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new MyFatoorahError("MyFatoorah request timed out");
    }
    throw new MyFatoorahError(`MyFatoorah request error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}
