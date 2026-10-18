---
title: Review an agent change from chat
description: Follow worktree isolation, a real TDD cycle, managed execution and human evidence review in one conversation.
---

# Review an agent change from chat

Complete [installation](installation.md) and [project setup](configuration.md), then
use the actual working checkout throughout. This example concerns order quantity:
a valid change persists a new total; invalid input preserves the existing order.
It describes a workflow to perform, not previously observed execution results.

```mermaid
flowchart TD
    C["Chat: define the change"] --> T["Agent: worktree + observed TDD red → green"]
    T --> M["MCP: request managed verification"]
    M --> A["Ask: human approves captured inputs"]
    M -->|"Auto policy"| E["Redpact: execution and recorded evidence"]
    A --> E
    E --> H["Human: inspect source, results and screens"]
    H -->|"Request a revision"| C
```

## 1. State the behavior and evidence

> Implement quantity editing in a worktree using TDD. Verify valid persistence and
> invalid-input rejection through the application's public API, check the browser
> interaction, and capture the initial, saved and error states on desktop and mobile.
> Use Redpact and return the actual execution references.

The agent resolves or creates the worktree with host Git tools and reads
`redpact workspace status --path PATH` for that absolute checkout. It uses `redpact settings describe/get/patch/validate --scope project` when shared
settings need inspection or validation. Status inspection never starts tests.
Independent subagents can own API, UI and documentation work with explicit file
boundaries; their coordinator verifies the integrated checkout.

## 2. Observe the intended assertion fail

Write the acceptance regression before implementation and run it. Record which
assertion failed and why. A syntax error, unavailable container, missing dependency
or collection failure is a setup problem, not functional red. Then implement the
change without weakening the intended assertion and rerun it to green.

Local test commands support fast iteration. They do not create connected Redpact
records. Use managed execution for the final evidence and identify local-only red
or green observations honestly. [Test authoring](tests.md) owns runtime details.

## 3. Request managed verification in the conversation

| Evidence | MCP entry |
| --- | --- |
| Complete configured Unit command | `redpact tests run --kind unit` |
| Public API and persistence scenarios | `redpact tests run --kind integration` |
| Actual browser interactions | `redpact tests run --kind playwright --target TARGET` with a functional target |
| Recorded application screens | `redpact tests run --kind playwright --target TARGET` with a capture target |

Each request uses the exact worktree path and shared fixed configuration. Unit,
Integration and Playwright remain distinct runtimes and evidence contracts.
Under Ask, a human approves through the connected execution review. The agent may
explain the pending request; it cannot approve it or change policy to continue.
Approval is tied to the reviewed inputs and does not accept the resulting code.
See [interfaces](interfaces.md) for admission and client requirements.

## 4. Open the evidence that needs attention

The agent reads progress and terminal state, uses `redpact runs context --kind integration --id ID` for bounded
failure details and evidence references, and links the recorded execution in the same
viewer instance. Open that exact execution to inspect results, captured source,
logs and screenshots. Its history stays bound to the recorded worktree. The full app also provides project/worktree navigation, test catalogs, environments and settings. Chat MCP returns structured evidence and review links.

Read the assertions, not just their titles. A test named “updates the total” that
only checks status 200 does not establish persistence. Compare case and step results
with captured source. Unit records whole-command output, not invented per-case facts.
Screenshots support human visual judgment; capture success alone is not approval.

## 5. Request a revision without losing the original evidence

> In this execution, the save succeeded but the value reverted after reload. Inspect
> the recorded source and failed assertion, fix persistence, and run the same intended
> check against this worktree again. Include both execution IDs and cleanup status.

A new run captures new inputs. Old passing results do not become evidence for new
code. Check execution outcome, current-source freshness and human acceptance
separately. Resource cleanup retains the recorded evidence.

The host agent handles commits, PRs and merges within the requested scope. Redpact's
execution approval does not authorize those actions or replace code review. Continue
with [reading results](results.md) to interpret each kind of evidence.

## Try the included scenario

With Docker and a connected runtime, use the absolute `examples/order-desk` path.
Call `redpact settings describe --scope project`, then `redpact settings validate --scope project`; preserve its supplied fixed
`app` / `payments: mock` settings. Submit `redpact tests run --kind integration` with:

```sh
redpact tests run --kind integration \
  --path /absolute/path/to/redpact/examples/order-desk --test http.test.js --json
```

The path is relative to that example's configured `tests` directory. The scenario
checks HTTP 200 and a response containing `quantity: 1` and `totalCents: 250`; its
local fixture supplies the managed service connection. This verifies one mocked
checkout response, not real-provider compatibility, restart persistence or browser behavior.
Follow the returned identity with `redpact runs show --kind integration --id ID`, including any human approval stages,
then use `redpact runs context --kind integration --id ID` to open the exact result. Compare the returned ID,
checkout, captured source, outcome and cleanup. An ID is not a passing result.

Each execution owns a fresh environment. Preserve failed attempts and submit a new
request after fixing inputs; polling never reruns a request or captures later edits.
