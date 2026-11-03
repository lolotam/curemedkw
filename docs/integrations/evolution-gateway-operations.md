# CureMed Evolution gateway operations

2026-11-03. Existing gateway infrastructure repair was separately approved. This record does not approve CureMed application migrations/merge, automation activation, pairing, message sends, Shipa bookings or live payments. Ministry shopping hold remains a separate enforced boundary. Full application readiness is still incomplete.

## Deployed identity and isolation

Dokploy application `w4DS2-k_EauA17sMm-ONL`, Swarm service `curemedkw-evultionapi-wrtdxe`, retains its original Evolution2.3.7/Baileys7.0.0-rc14 build at source commit `f1100ad8741fb8af5015fc86b11e78e95d50c353`. Source type remains github with autoDeploy=false. No rebuild/version substitution or conversion to a registry-pulling provider was performed.

The running image must equal `sha256:be2cbdefd40b2c10e780b05b812fe7a2291525ada4e2af70af64bfabb7c766a5`. Immutable local tag: `curemed-evolution:f1100ad`. Protected docker-save archive: `/root/curemed-evolution-repair-20261103/evolution-f1100ad.tar`,394936320bytes, SHA256 `35f0fc21d6b3dbfc88c62a2c46c968decfdb7707ae29b0e3a241c56428616944`. Local RepoDigest metadata is not proof of remote registry availability. Preserve these bytes and verify the actual container Image id after any reload.

Dedicated dependency Dokploy compose stack `BnSYcX6GbZiMhWJNkNAhI`, app name `curemed-evolution-deps-4jhqia`, is in CureMed's existing production environment. Its PostgreSQL and Redis are separate from all CureMed application/shared databases and caches:

- PostgreSQL: `postgres:16.10-alpine3.22@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297`, database/user `evolution`.
- Redis: `redis:7@sha256:3e0669e42d4fe421c9dea0ba5fbc04d336b80b4f32a6c7d25bee3a1d089288a1`, authenticated, AOF enabled.
- Owned external volumes: `curemed_evolution_postgres_20261103`, `curemed_evolution_redis_20261103`. Gateway session volume: `curemed_evolution_instances_20261103` at `/evolution/instances`.
- `curemed-evolution-data`: internal attachable overlay for gateway/PostgreSQL/Redis only. `curemed-evolution-edge`: separate internal attachable overlay for gateway/Edge only. Edge has no membership in the data overlay. Gateway retains its existing Dokploy network for required outbound connectivity.

There are no published PostgreSQL/Redis/gateway service ports or new public domain. Internal gateway origin from Edge is `http://curemed-evolution:8080`; it is server-owned configuration, never a browser-editable arbitrary endpoint. Owner credentials were delivered privately and transferred encrypted. Dependency credentials are Docker Swarm secrets, not command-line password values. Gateway managed runtime environment holds its authentication/connection configuration. Do not dump environment, Docker inspect objects, secret files, URIs with passwords or raw provider bodies into logs/chat/repository.

## Runtime evidence and its limits

The original four nonsecret Dokploy environment entries were retained exactly. The deployed source explicitly uses parseInt(SERVER_PORT)||8080, so its existing blank SERVER_PORT entry resolves to8080. The global auth guard reads the apikey header and configured API key; the inspected guard has no license-required branch. This is evidence for the pinned custom build, not a claim about other/latest Evolution releases.

After the no-build managed reload, gateway health was healthy with the original image id. A helper joined the actual Edge container's network namespace and made only GET /instance/fetchInstances requests: missing key401, wrong key401, correct key200 with an empty instance array. No instance creation, QR, account pairing, webhook configuration or message operation was performed. A healthy root endpoint alone is not authenticated API proof.

The Edge link is persisted in both Dokploy's managed compose definition and the actual compose file. Fully interpolated before/after configuration comparisons allowed only the new network definition and functions-service network membership. The running Edge container joined in place: its id/image/env/mounts/restart count remained unchanged, the divergent router was not replaced, and no application deploy or migration runner was invoked. Future managed deployment definitions include the same link; full application deployment verification remains a later release gate.

Controlled persistence rehearsal completed: new PostgreSQL task retained its migration records, a short-lived synthetic Redis key survived the new Redis task through AOF, and a new gateway task reattached the same volume with the exact original image. The final gateway container was8582c5270881, healthy/zero restarts, started2026-11-03T20:54:05.624398223Z. Authenticated GET checks from Edge again returned401/401/200 and zero instances. A read-only production setting check confirmed shopping_enabled=false and checkout_enabled=true. No application database value was modified.

This proves the unpaired infrastructure rehearsal, not restoration of a paired WhatsApp session: no paired instance exists yet. That later proof requires the designated device operator and reviewed pairing screen; no send consent follows from account designation. Full application/shared-payment/automation/UI acceptance and application rollback rehearsal remain open.

## Safe operating and rollback boundary

Protected root-only repair directory: `/root/curemed-evolution-repair-20261103` (0700). Credential/backup/state files are0600. It retains application/Edge/compose before snapshots, exact image archive, runtime state and sanitized authenticated proof. Private credential material is not reproduced here. Do not treat unavailable connector output as proof that a remote mutation failed; inspect the specific service/update state before retrying a mutation.

Use the managed existing application reload path after validating configuration; do not invoke Git rebuild/redeploy or enable autoDeploy as an incidental repair. The controlled source preparation pins the local latest tag to the retained bytes; container id equality is the final check. Dependency compose deployment must retain external volumes, versioned external secrets and image pins. Never select freshVolumes, prune, delete histories or recreate the gateway/database from a mutable latest image.

For an infrastructure defect in this unreleased, unpaired setup, contain the gateway by setting its managed replica count to0 and applying the managed no-build reload; retain dependency volumes, credentials/secrets, databases and session data. Confirm the service is stopped. Existing Postora/application behavior was not switched by this repair. Do not respond to an uncertain message/shipment result by retrying creation.

If the Edge network addition itself must be reversed, remove only `evolution_internal_api` from the functions service and top-level networks in BOTH the managed definition and disk source, validate the inverse network-only semantic diff, then disconnect only that overlay from the unchanged Edge container. Do not restore an old whole compose/env snapshot over later independent changes. Keep the data overlay and persistent resources while referenced; no destructive cleanup is implied.

Before restoring any gateway before-fields from the protected snapshot, compare current configuration and subsequent authorized changes. Restore only the reviewed owned fields, retaining session data and the pinned image. The pre-repair gateway was unconfigured/unhealthy; its old env is not a functional application rollback. Full application provider migration/activation rollback, payment/outbox handling and queued-job disposition remain separate mandatory release work.

## Corrected preparation failures

The first reload was rejected by Docker before service mutation because the managed CPU field expects NanoCPUs; a value1 represented1e-9CPU. The old service version/env were observed unchanged; the limit was corrected to1000000000 and the managed reload then completed. No unknown request was blindly repeated.

The first compose semantic rehearsal detected PyYAML1.1 converting KONG_DATABASE=off into a different string. No compose write had occurred. A safe YAML1.2 boolean resolver preserved on/off strings and the full network-only comparison then passed. Broad unrelated configuration changes were not accepted to make the check green.

Official managed API references checked for the operations used: [Compose](https://docs.dokploy.com/docs/api/compose), [Application](https://docs.dokploy.com/docs/api/application), [Mounts](https://docs.dokploy.com/docs/api/mounts). This document records project-specific deployed behavior; API documentation alone does not establish successful repair or complete feature acceptance.
