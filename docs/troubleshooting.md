---
title: Troubleshooting
description: Diagnose connections, settings, environments, test execution, and missing results.
---

# Troubleshooting

Start with the returned run identity and checkout path. Open the corresponding run or Log entry and read the recorded error. Preparation errors, failed assertions, and cleanup failures have different remedies.

## Locate the first failing stage

Work forward from connection to cleanup. Fix the earliest failing stage before interpreting missing results from later stages.

| What you observe | Check first | Next action |
|---|---|---|
| Agent cannot reach any tool | Instance health and MCP URL | Restore the connection, then try `configure describe` |
| Configuration returns field diagnostics | Named file, field and actual checkout | Repair the declaration and validate again |
| Request has an ID but no completed cases | Pending state and preparation diagnostics | Follow that ID; resolve the reported gate or startup issue |
| Runner cannot import a file | Test root and captured helper paths | Correct the source bundle and submit a new request |
| A case reaches a failed expectation | Expected value, actual value and fixture data | Investigate application behavior and the assertion |
| Tests finish but resources remain | Environment cleanup status | Use the applicable viewer lifecycle control and verify cleanup |
| A screenshot looks older than the last attempt | Capture target, scope and Runs history | Open the exact attempt before judging freshness |

Do not repeatedly submit the same request just to obtain progress. Keep its returned identity and read it. A new execution is useful after you have corrected inputs or intentionally want another attempt.

## The agent cannot connect

Confirm the intended app or server is running and compare its address with the agent's MCP URL. The desktop plugin targets port 54321; a development server may use another port and data directory. Connecting to another instance can make valid runs appear missing in the viewer.

After updating a plugin connection, refresh the client or start a new agent task. Ask for `configure` with `action: "describe"` and the absolute project path. A skill installation alone does not start the server. Use the local HTTP MCP connection; a stdio bridge is not provided.

For rejected requests, check the intended local hostname and whether a browser proxy changed Origin or Host. Correct the endpoint instead of disabling local request checks.

## A request remains pending

If the connected runtime returns `awaiting_approval`, its returned identity represents a pending review, not a completed execution. Read its state with `get_run`; polling does not approve it. Use the review controls available in the connected client. If the client cannot present the required controls, report that limitation and leave the request pending rather than claiming execution or a passing result.

## A project or worktree is missing

Check the absolute directory in instance `projects` and observation diagnostics from `configure`. Git-linked checkouts must still exist and be discoverable by Git. Deleted checkouts retain history but cannot execute.

Compare `rulesRoot` and `projectRoot`. Shared settings belong to the primary checkout; editing a linked-checkout copy will not override them. Repair a moved or missing primary project path instead of substituting another checkout's settings.

## Settings will not validate or save

Follow the diagnostic's file and field path. Common causes are duplicate keys, unknown fields, non-relative paths, missing Compose services, and invalid dependency kinds. Only `isolated`, `shared-local`, `remote`, and `mock` are accepted.

Malformed or duplicate-key JSON needs file repair and reload. On a save conflict, preserve the draft, load current source, and reconcile edits. Another editor may have changed the file since loading. Repeat `configure validate` with the actual execution checkout .

## Validation passes but preparation fails

An empty Compose list is valid for inspection but produces `environment_unconfigured` for managed environments. Add the application's Compose files or use the unit command path for unit-only work.

Check Docker availability, its CLI, build/image errors, published TCP ports, listening interfaces, and healthcheck diagnostics. A URL declaration does not make an application listen on that port. Container addresses use Compose names; both container runners use resolved `tests.env` URLs.

Configure nonempty root services and one fixed definition per dependency in shared settings. Bindings must target active services; two dependencies cannot write the same variable. See [configuration](configuration.md).

## A credential is missing

Enter its value directly in Project Dependencies. Use that editor if the client cannot show an input card. Give the agent availability information, not the value.

Check the exact reference name and configured dependency kind. An explicitly saved empty value blocks server-env fallback. Start a new test execution after replacing a value; running executions keep their captured values.

## Previous environments cannot be reused

Test-environment reuse and standalone preparation are not supported. Start a new execution for a fresh temporary environment. Project Container separately supports manual inspection. Independently managed services use shared-local or remote kinds. Previous execution evidence remains available.

## Tests fail before assertions

Separate collection/import errors from assertion failures. Integration paths are relative to `tests.directory`; requested test paths must be exact. Keep helpers and permitted pinned package inputs in the bundle. Collection limits are 50 files, 200 KB per file, 2 MB total, and 5000 visited entries. Symlinks are rejected. The collector includes `.ts`, `.js`, `.json` files and the root `pnpm-lock.yaml`; other extensions are skipped. Unsupported paths or package/config inputs among the collected files can reject the submission. A requested test must end in `.test.ts`, `.test.js`, `.spec.ts` or `.spec.js`.

For unit execution, the Dockerfile must copy sources into `/workspace`, install dependencies, and provide `/bin/sh`. Verify its configured `cwd` and command. The container does not inherit host-installed dependencies. A build or startup error does not establish a failed assertion.

## A run exceeds time or memory limits

Read the recorded reason. Per-test timeouts differ from Global Settings execution limits, defaulting to 2048 MiB and 600 seconds. Check loops, watch commands, excessive workers, and memory growth before increasing the budget for a legitimate workload.

When present, `resourceLimit` records the applied threshold, detection source, and termination confirmation. Forced termination may prevent final case reports or screenshots. OOM text alone does not prove an externally detected violation. See [resource limits](execution.md) for coverage and platform requirements.

## Results or screenshots are missing

Match the run ID, project, execution checkout, and instance. File observation does not execute tests. Terminal output from a local command is not submitted Redpact evidence.

Project Screenshots shows maintained `project` capture targets. A `worktree` target stays in execution history and does not replace maintained screenshots. The current list prefers the latest successful completed run per target, falling back to a completed run until success. Use Runs to inspect an exact failed attempt or older capture.

New Playwright runs execute the selected checkout once without a comparison baseline. Missing artifacts may mean no attachment was produced or execution ended before reporting finished. Read the recorded case and error.

## Cleanup failed after execution

Read cleanup status separately from test outcome. Use supported web controls for cancellation, cleanup retries, then verify the resulting state. Run evidence remains retained.

Worktree Playwright draft cleanup is explicit and can refuse active, edited, or unrecorded files. Preserve those files and resolve the reported condition instead of force-deleting them. Successful draft cleanup retains recorded sources and artifacts.

## Example: settings pass, but the application URL fails

First check whether environment preparation completed. If the image failed to build or the service failed its healthcheck, an HTTP assertion is not the first problem to solve.

If preparation succeeded, compare the test's variable name with `tests.env`. An example using `APP_URL` will not read a binding named `BASE_URL` automatically. Confirm that the binding references the application's actual internal port and a published TCP port, and that the service listens on a reachable interface.

Then inspect the URL construction in the test. A Compose hostname such as `app` is an internal service name, not the host address for Vitest. Use the resolved service URL rather than copying a container address or a host port from an earlier run. After correcting the inputs, submit a fresh execution and preserve the original failure for comparison.

## Example: a file appears in Tests but has no passing result

The source catalog and execution history answer different questions. A current file can be listed because its path matches the configured patterns, even if it has never executed.

For Unit, confirm the configured command includes that test; browsing patterns do not alter the command. For Integration, inspect the submitted source bundle and requested test paths. For Playwright, confirm that the file matches exactly one target and that you executed that target in the intended worktree. Then open the resulting record instead of using source visibility as evidence of success.

## Report a problem

Include the Redpact version or commit, instance address, checkout path, run ID, test kind, diagnostics, and failure stage: preparation, execution, or cleanup. The Log copy action provides recorded execution text. Review it before sharing and omit secret values, private settings storage, and unrelated project content.
