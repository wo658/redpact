---
title: Read execution evidence
description: Review one recorded request or result and its worktree history.
---

# Read execution evidence

Open the exact `reviewPath` returned by `get_review_context` on the same viewer
instance. The URL carries execution kind and identity. The viewer resolves the
record's worktree; selecting another checkout elsewhere cannot retarget it.
Without an execution link, the viewer asks you to open a record from chat.

## Requests, runs and history

A pending request is not a run. Under Ask, inspect the captured command or target,
settings/input identity, and Integration services, dependencies and test source
before using the explicit approval control. Integration requires environment and
then test approval. Cancellation does not approve or accept anything.
A compliant MCP App provides the same human decision in chat. See [interfaces](interfaces.md).

The execution review presents recorded outcomes, bounded diagnostics, source and
available browser artifacts. History is scoped to the record's worktree and opens
another exact record. Missing live checkouts do not invalidate retained results;
records without a worktree do not borrow an unrelated checkout's history.

| Evidence | What it establishes |
| --- | --- |
| Unit | Complete configured command, exit status, output and cleanup facts |
| Integration | Submitted test/helper source, observed cases/steps and environment facts |
| Playwright functional | Actual browser assertions and available artifacts |
| Playwright capture | Recorded screens for human visual judgment |

Read assertions and recorded source together. A title alone does not establish what
was checked. Capture success is not visual acceptance, and an exit code does not
invent Unit per-case results. Source reads use retained inputs, not edited working files.

## Outcome, freshness and acceptance

A passing run describes its captured inputs. Later edits require new verification.
`get_review_context` keeps execution outcome, source freshness and human acceptance
separate; unverified freshness stays `unknown` and acceptance stays `not_recorded`.
Compare execution IDs when discussing retries, rather than treating the newest file
or a previous passing attempt as current evidence.

Preparation, collection, assertion and cleanup failures require different remedies.
The record preserves the first relevant error and retained resource references.
A finished Playwright run alone does not prove removal; without explicit cleanup
evidence its summary reports `unknown`. Cleanup errors report failure separately
from the test verdict. Use supported cancellation/cleanup retry and read back state.

## Continue from chat

Use `get_execution` for a result, bounded log, recorded test source or PNG, and
`list_executions` for the checkout's retained history. Use `get_review_context` to
explain a failure without copying an entire record into chat. Review private data
before sharing artifacts; log masking does not sanitize screenshots or captured files.

Keep the original failed attempt when requesting a correction, then submit a new
request after changing inputs. Approval of execution does not authorize a commit,
merge, publication or acceptance of the code. [Troubleshooting](troubleshooting.md)
and [test authoring](tests.md) describe diagnosis and coverage.
