# Redpact development settings

Managed self-E2E setup and agent instructions are in [e2e/README.md](../e2e/README.md).
The suite runs the actual application and records results against the selected
checkout. The Order Desk example remains an independent application.

Call `configure describe` before authoring the one `.redpact/settings.json` at its
returned `rulesRoot`. Merge the checked-in `e2e/settings.example.json` values while
preserving unrelated settings. The example is not read automatically by runtime.
Call `configure validate` with the execution checkout and select the `app` service.

Linked worktrees share primary rules; Compose and test paths resolve in the selected
checkout. A branch without the E2E files cannot execute this configuration until it
contains them. Keep the installed controller separate from the managed application.
