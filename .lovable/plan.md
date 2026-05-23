# Fix: Postora WhatsApp 400 "Missing `action`"

## Problem
The `send-whatsapp` edge function POSTs JSON `{ action: "send_text", to, message }` to Postora, but Postora replies:
`{"success":false,"error":"Missing \`action\` (send_text|send_template|send_media|event)"}`

Postora's `ecommerce-whatsapp-api` reads `action` from the **URL query string** (and/or expects the field at a specific location), not from the JSON body. That's why the body's `action` is ignored.

## Fix (single file)
Update `supabase/functions/send-whatsapp/index.ts`:

1. Append `?action=send_text` to the Postora endpoint URL when calling it.
2. Keep `action` in the JSON body too (harmless, covers both contracts).
3. Log the outgoing URL in the response payload so the next failure is easier to diagnose.

```ts
const url = `${POSTORA_ENDPOINT}?action=send_text`;
const r = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": apiKey },
  body: JSON.stringify({ action: "send_text", to: phone, message }),
});
```

Everything else (settings gating, templates, logging to `whatsapp_send_logs`, per-recipient loop) stays unchanged.

## Verify
1. Redeploy `send-whatsapp` (automatic).
2. In `/admin/whatsapp` → **Send test** to your number.
3. Expect toast "Test sent" and a `sent` row in Recent activity.
4. If still 400, the log row's `response_payload` will show Postora's exact rejection so we can adjust (e.g., switch to `send_text` as a path segment instead of query).

## Out of scope
No UI, schema, or business-flow changes — only the outbound request shape.
