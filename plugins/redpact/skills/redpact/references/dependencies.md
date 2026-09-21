# Fixed project dependencies

Read when a task changes runtime topology, connections or application containers.
Use the connected `configure describe` schema and the project's owning configuration
and execution documentation. An installed plugin does not update its runtime.
Report a schema mismatch; update an instance only when that action is authorized.

## Ownership and execution

One `rulesRoot/.redpact/settings.json` supplies fixed root services and one definition
per dependency to every worktree. Compose, Dockerfile and source paths resolve in
the actual execution checkout. No worktree selections, mode catalogs, overlays or
merge promotions exist. Preserve unrelated fields and omitted environment defaults.
Explicit bindings override or unset variables; conflicting dependency writes fail.
Application metadata and relationships do not implicitly start services.

Ordinary feature work reuses shared configuration. A task that requires configuration
changes may edit those shared settings within the user's authorized scope; explain
the effect on future worktree executions. Do not invent a local overlay to isolate
settings. Keep code and Compose edits in the intended task checkout. Never copy
credentials into settings or test sources; use named secret references and secure
credential input. A validation pass proves neither readiness nor approval.

## Choose and verify a topology

Inspect actual application clients, startup, readiness and implemented substitutes.
Reuse explicit decisions. Ask for missing external endpoints or consequential choices
that cannot be inferred. Configure one agreed topology, which may combine:

- `isolated`: actual dependency Compose services created per execution.
- `mock`: an implemented Compose substitute or in-process mock enabled by bindings.
- `shared-local`: existing host infrastructure, never provisioned or removed by Redpact.
- `remote`: existing remote infrastructure retaining its real endpoint and credentials.

Integration and Playwright are container runners with separate network namespaces.
Both receive explicit `tests.env` bindings and `REDPACT_CONNECTIONS_FILE`; application
variables are not inherited. Managed consumer addresses use internal ports and
`<service>.redpact.test` DNS aliases. Shared-host URLs require a real reachable path;
`host.docker.internal` alone does not prove loopback connectivity, especially on Linux.
Verify from each actual consumer. Preserve browser origin, CORS, cookies and TLS;
configure the application's intended origin rather than disabling browser security.

Validate the actual checkout, execute required acceptance paths, and verify fresh
resources, failure behavior and cleanup. Check host published-port access separately
when manual inspection requires it. Shared external fixtures need data isolation.
Report tested topologies and limitations, not inferred readiness from declarations.
