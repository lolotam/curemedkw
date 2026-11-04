const allowedOrigins = new Set([
  "https://curemedkw.com",
  "https://www.curemedkw.com",
  "https://curemedkw.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
]);

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.has(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "https://curemedkw.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info,x-supabase-auth,myfatoorah-signature,idempotency-key",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export function jsonError(
  req: Request,
  code: string,
  message: string,
  status = 500,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(req, { success: false, error: { code, message, ...extra } }, status);
}
