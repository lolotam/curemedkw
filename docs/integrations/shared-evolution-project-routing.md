# Shared Contabo Evolution project routing

Owner direction, 2026-11-04: reuse the intended existing Contabo Evolution service for CuremedKW and Romani, with separate instances and each website's own administrator pairing screen. This replaces the earlier coordination-only restriction. It does not authorize messages, shipments, payments, history operations, credential rotation, or lifting the Ministry hold. Application migrations, merges and deployment retain their concrete review gates.

## Current managed service

The supported Curemed SSH route is `default`, host `187.77.169.216`. Read-only reconciliation on 2026-11-04 found the intended Swarm service running; an earlier Romani name/image inventory did not establish its absence.

| Identity | Observed value |
| --- | --- |
| Dokploy application (retained mapping) | `w4DS2-k_EauA17sMm-ONL` |
| Swarm service | `curemedkw-evultionapi-wrtdxe` |
| Service ID | `mu40grhmcr9arhpejhcjoa9bf` |
| Running task | `cspqefxbgq4msj8ure5h9ur2i` |
| Container | `8582c5270881` |
| Custom package/source | Evolution `2.3.7`, source `f1100ad8741fb8af5015fc86b11e78e95d50c353` |
| Actual immutable image | `sha256:be2cbdefd40b2c10e780b05b812fe7a2291525ada4e2af70af64bfabb7c766a5` |
| Task health | Running, healthy, zero restarts, one desired/running replica |
| Started | `2026-11-03T20:54:05.624398223Z` |
| Published ports | None |
| Networks | Existing `dokploy-network`, `curemed-evolution-data`, `curemed-evolution-edge` |

CureMed/Waleed owns the shared infrastructure, operated through the Curemed manager's supported SSH/Dokploy route. Dr Marawan is Curemed's designated device operator; that is a separate role. No duplicate Evolution service, rebuild, image substitution, reload, network change, or credential rotation was needed for this allocation.

## Fixed project allocations

| Project | Exact instance | Backend-only origin | Scoped credential |
| --- | --- | --- | --- |
| CuremedKW | `curemed` | `http://curemed-evolution:8080` from the existing Edge overlay | Separate instance token, never the master key |
| Romani | `romani` | `http://curemedkw-evultionapi-wrtdxe:8080` from its existing Dokploy network | Different instance token, never Curemed's token or the master key |

Both records were created with `qrcode:false`, `integration:'WHATSAPP-BAILEYS'`, `syncFullHistory:false`, `readMessages:false`, `readStatus:false`, `alwaysOnline:false`, and no active webhook. No own-instance connect/QR operation was invoked, and no phone was paired. Both report `close`.

Names and origins come from trusted server configuration/constants. Browser request bodies, queries and headers must never select a project, instance, provider endpoint, credential, or actor. Each website authenticates its own administrator using its existing server-verified session/role boundary. A project token is kept only in its backend deployment. Neither token nor the Evolution master key is returned to either browser. Do not expose a generic Evolution proxy.

The pinned deployed `src/api/guards/auth.guard.ts` compares a non-master key with the token of the exact route `instanceName`. Its `instance.controller.ts::fetchInstances` filters non-master results by token ownership. This is source evidence, supported by the native checks below; it is not a claim about every Evolution release.

## Pairing/status transport contract

Only these native paths belong to the initial website pairing capability:

- `GET /instance/connectionState/curemed` and `GET /instance/connect/curemed` for Curemed.
- `GET /instance/connectionState/romani` and `GET /instance/connect/romani` for Romani.

The backend attaches its own instance token in the `apikey` header. It never accepts that key from a browser. Redirects are refused, deadlines and response bodies are bounded, and provider errors/bodies are replaced with fixed safe errors. Pairing QR data is a temporary credential: authorized response only, `Cache-Control: no-store`, transient UI memory only, no logs, persistence, analytics, local storage or browser cache.

The observed source has two connect response families. When already connected, the response is `{instance:{instanceName,state}}`. When closed/connecting, it returns the flat QR object, whose fields include `base64`, `code`, `pairingCode`, and `count`; it does not necessarily include `instanceName`. Reject a contradictory identity whenever one is present. Do not require or fabricate provider identity in a flat QR response: the fixed requested path and instance-scoped key establish the request binding. `connectionState` returns the nested identity; an absent/unrecognized state is honestly `unknown`, never inferred connected. A JSON error inside HTTP 200 is a failure.

The initial screen does not create, reset, restart, delete, logout, send, fetch instances/history, or import contacts. Connect is an explicit administrator action; it is not run automatically on page load. Already connected sessions are preserved. Full Curemed messaging/provider activation remains governed by its existing separate plan, SQL and review gates.

## Connection-only webhook contract

Romani's fixed destination is `https://romani.curemedkw.com/api/whatsapp/webhook`. Its proposed deployed backend variables are `ROMANI_EVOLUTION_URL`, `ROMANI_EVOLUTION_API_KEY`, `ROMANI_EVOLUTION_INSTANCE=romani`, and an independent `ROMANI_EVOLUTION_WEBHOOK_SECRET`. These names are the Romani manager's implementation contract, not proof of current deployment.

Use nested configuration in this custom build:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://romani.curemedkw.com/api/whatsapp/webhook",
    "headers": {"x-romani-webhook-key": "<PRIVATE_PROJECT_WEBHOOK_SECRET>"},
    "events": ["CONNECTION_UPDATE"],
    "byEvents": false,
    "base64": false
  }
}
```

This is a contract example, not an executed activation. Enable a webhook only after its reviewed authenticated endpoint is deployed. The pinned webhook controller forwards the custom header and emits body event `connection.update`. The receiver requires a nonempty configured secret, constant-time header comparison, exact `body.instance === 'romani'`, and exact connection event. It projects only the bounded connection state it actually uses. No provider HMAC signature is claimed.

Native envelopes also include `apikey`, `sender`, `server_url` and `destination`; these are not authorization and must be dropped, never logged, persisted or forwarded. The token in a native body is not a replacement for the independently generated header secret. No incoming messages or personal chat history is subscribed to by this connection-only contract. A stale webhook must not become payment, send, or provider-activation authority. Curemed's initial pairing webhook follows the same fixed-instance/header boundary; full generation-aware ingestion remains a separate integration slice.

## Native checks performed on 2026-11-04

Before provisioning, authenticated inventory contained zero instances. Backups were taken first. After provisioning, both project tokens independently returned:

- Own exact connection status: HTTP 200, matching identity, state `close`.
- Other project's connection status: HTTP 401.
- Other project's QR/connect route: HTTP 401; own connect was never called.
- Scoped native inventory: HTTP 200 with exactly its own instance.

From the actual Romani backend container `d4da170b28f8b18de1d9b06a4d5ee32ebb01f600bc1a98065fe1546fcb22c314`, its own status returned 200/matching `romani`/`close`, and Curemed's status returned 401 through the existing network. Backend service `romaniapp-romaniapp-7nuhor`, ID `wfzufbe91piu8mc1iyuqagwdi`, remained healthy at image `sha256:438582f0ee35ed218fc1e6c7279ad60788a1b100979d14cae5ffebc015d22d0a`.

These are manager-run native gateway/network receipts, not independent SA reruns, website endpoint/UI proofs, webhook-forwarding proof, device pairing, paired-session restoration, message delivery, or application deployment acceptance. Local handler cross-project/forged-actor tests and final assembled review remain mandatory.

## Private handoff and rollback assets

New server-only directory `/root/curemed-evolution-projects-20261104` is mode 0700. Separate `curemedkw.private.json` and `romani.private.json` are mode 0600. Each contains only its project/instance identity, its scoped `api_key`, independent `webhook_secret`, and internal origin. The master key stays in the existing protected repair bundle and was not copied into those files. No secretRef was invented and no new owner card was requested.

For Romani's later reviewed backend deployment, consume its file inside the trusted operator process without returning contents to chat/tool output: map `api_key` to `ROMANI_EVOLUTION_API_KEY`, `webhook_secret` to `ROMANI_EVOLUTION_WEBHOOK_SECRET`, `instance` to `ROMANI_EVOLUTION_INSTANCE`, and `origin` to `ROMANI_EVOLUTION_URL`. This is a secure-file handoff location, not permission to bypass application deployment gates. Never mount/share Curemed's file or the master repair bundle into Romani.

Before allocation, a dedicated Evolution database custom dump and a read-only session archive were saved, with hashes checked and the dump catalog parsed successfully:

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `before-projects.pg_dump` | 93432 | `4394862ec20ec9b1385472101e08bcf985c34440e80c43b79909a4c580f5860d` |
| `before-projects.sessions.tar` | 1536 | `83ce73a22c703d62ca563cd465de94bef14e8af125b02842bdf3b87e4ef873bf` |

They are in the protected directory, alongside a backup manifest and sanitized native proofs. A parsed archive/dump catalog is not a full restore rehearsal. Original image archive, dependency/session volumes, credentials and earlier rollback assets remain retained as documented in `evolution-gateway-operations.md`.

If a website release fails, remove only that website's pairing entry points/configuration through its reviewed rollback. Preserve both instance records, scoped keys, database and session volumes. Do not delete/logout/recreate an instance or restore the old whole database over subsequently paired sessions. Infrastructure rollback remains a separately reviewed operator action, not an automatic response to an uncertain request.

Operator script SHA256: `1e318bae8cd71a506f6aeef587acb81bb83219d4a09b419ca548d3a395c446b2`, retained privately at `operator-v1.py`. A too-long SSH command was rejected before execution; SFTP transfer was used instead. An initial extra trailing newline was detected by unequal hashes and corrected before provisioning. Final local/remote script hashes matched. No failed preparation was counted as successful provisioning.
