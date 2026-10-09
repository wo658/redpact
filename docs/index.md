---
title: Develop in chat, review with Redpact
description: Managed verification and recorded evidence for agent development.
---

# Develop in chat, review with Redpact

Ask the coding agent to implement a change with TDD in an isolated worktree.
Redpact captures execution inputs, runs Unit, Integration and Playwright checks,
and opens the exact recorded request or result when a human decision is needed.

| Owner | Responsibility |
| --- | --- |
| Host conversation and agent | Worktrees, subagents, files, configuration, local TDD, Git and publication |
| Redpact MCP | Configuration diagnostics, managed execution, status, cancellation and evidence lookup |
| Redpact viewer and Apps | Human execution approval, recorded source/results/screens and worktree-bound history |

The viewer opens an execution link from chat. Its history stays bound to that
record's worktree. With no execution context, it asks you to open a record from the
conversation. Project management, settings editors, test launch catalogs, manual
containers and Git operations are outside the viewer.

> Implement quantity editing in a worktree using TDD. First observe the intended
> assertion fail, then implement it. Use subagents for independent work. Request
> managed API and browser checks against this checkout and return the recorded
> execution links, desktop/mobile captures and remaining review decisions.

Under Ask, a person approves the captured request in an MCP App or the connected
review screen. Approval authorizes execution; it does not accept the code change.
A passing result, current-source freshness and human acceptance are separate facts.
A collection or environment failure does not establish a TDD assertion failure.

Start with [installation](installation.md), [configuration](configuration.md) and
[the review workflow](review-workflow.md). [Results](results.md) explains evidence;
[test authoring](tests.md) defines supported runtimes. All worktrees share one fixed
configuration while each run owns its temporary resources. See [dependencies](dependencies.md).

Redpact is pre-release. This documentation describes the implementation and does
not connect to local projects itself.
