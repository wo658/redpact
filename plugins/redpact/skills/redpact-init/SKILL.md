---
name: redpact-init
description: Inspect and configure an actual project for Redpact through authored files and MCP validation. Resolve fixed dependencies and verify the agreed managed execution without project-management UI. Feature development belongs to redpact.
---

# Redpact Init

Resolve the actual target checkout and shared primary settings root from the request,
repository and connected runtime. Keep the Redpact service separate from the target.
Read the [configuration guide](references/configuration.md) before authoring.

Inspect the application and `configure describe`, preserve unrelated configuration,
and write the supported `.redpact/settings.json` directly. Configure observation in
the instance file only when needed; verify actual discovery separately from validation.
The full app also provides project management, settings and manual Container controls.
Chat setup uses the file-authoring workflow above; inline MCP cards handle request
approval and evidence without embedding the full management interface.

Use the [dependency guide](../redpact/references/dependencies.md) when services,
connections or fixed dependency kinds need setup. Reuse inspected facts and accepted
choices. Ask only for unresolved topology, endpoints or private inputs; never invent
a mock implementation, credentials, mode catalog or alternate configuration format.

Choose the capabilities needed by the request: Unit, Integration and/or Playwright.
A runnable service needs real Dockerfile/Compose definitions for managed execution;
unit-only or draft-only scope does not require placeholder services. Validate the
actual checkout, then request the agreed managed smoke check when authorized.
Under Ask, only a person can approve through the App or exact connected review.
Validation alone proves neither readiness nor approval. Do not launch persistent
development processes or unrelated tests/captures as an initialization side effect.

Report authored/reused files, execution and shared settings paths, discovery and
validation results, observed managed evidence and remaining limits. Use an actual
returned review path for evidence. Setup-only requests end here; authorized feature
work continues through the main redpact workflow without another onboarding round.
