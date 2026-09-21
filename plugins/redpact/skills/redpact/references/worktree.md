# Redpact worktree development

Combine immediate local Git isolation with the bundled [Redpact workflow](../SKILL.md). Read that skill for configuration, execution, evidence, and approval handling. This reference adds worktree lifecycle and requires test-first implementation for testable behavior changes; it does not depend on a separately installed wt-local skill.

## Request and scope

`$redpact <feature or fix>` defaults to this workflow. `$redpact current <feature or fix>` uses the current-checkout section below on the existing branch. The default workflow authorizes worktree preparation, reuse of the fixed project configuration, tests, implementation, verification, and a local commit. Begin without a separate plan approval. Questions about the workflow or requests to edit the skill do not start feature execution.

`$redpact auto <feature or fix>` or an explicit request to verify and finish through
local merge authorizes implementation, required verification, a local commit and
local merge for this task. Never infer auto mode from task size or carry it into
another task. Otherwise wait for a merge request. Push, PR creation, deployment and
a separate Codex task require the user's request. Explicit plan-only, no-commit,
no-merge or current-checkout restrictions take precedence over auto mode.

Init uses its own [checkout lifecycle](../../redpact-init/references/configuration.md#init-checkout-lifecycle):
setup code and Compose belong directly in the intended base-branch checkout, with readiness and
fresh-worktree reuse checks. Do not impose this feature workflow's screenshot or
acceptance gates solely for project init.

## Current checkout

For `current`, “in this checkout” or “without a worktree”, record the absolute path,
branch, HEAD and existing changes. Do not create/switch branches, relocate, merge,
stash or reset user changes. Continue in this checkout through the selected evidence
guides and the commit section below; commit only this task's changes unless no-commit
was requested. A detached HEAD needs a branch decision before committing. Skip the
isolated checkout preparation below. Already in this task's linked worktree? Reuse it.

## Prepare the checkout

Read repository instructions and relevant design documents. Resolve the Git root and any project subdirectory, then inspect `git status --short --branch`, `git rev-parse HEAD`, and `git worktree list --porcelain`. Record the base checkout, branch, and starting commit. Preserve user changes; do not stash, reset, or copy unrelated dirty files into the new checkout. If required work exists only as uncommitted changes and cannot be carried over safely, resolve that dependency before implementation.

For auto mode, identify the intended local main branch and its checkout from the
user's request and repository configuration before implementation. Do not assume
that the current feature branch is the merge target. Record the target separately
from the source starting commit; ask only if the target remains ambiguous.

If the current task already runs in a linked worktree, continue there without nesting another worktree. Otherwise derive an English kebab-case slug from the request and create from the current HEAD, using the repository's worktree path convention or this default:

```sh
git worktree add .codex/worktrees/<slug> -b codex/<slug> HEAD
```

Inspect existing branches and registered paths on a name collision. Reuse only a checkout for the same work; otherwise choose a distinct name. Do not infer a missing base branch when resuming work. A non-Git directory needs clarification before initializing a repository.

Use the absolute new checkout path as `workdir` for subsequent source and Git commands. Preserve any monorepo project-relative subdirectory when resolving the Redpact execution path. Install dependencies with the repository's package manager only when needed. Do not share node_modules through symlinks.

## Execute the selected work

Derive required evidence from the acceptance criteria in SKILL.md, prioritizing
Integration and frontend Playwright functional tests. Read the applicable
[Integration](integration-tests.md), supporting [Unit](unit-tests.md) or
[Playwright](playwright.md) guide before authoring or execution; follow its completion
criteria. Do not load unselected layers. Reuse existing Docker/Compose and dependency
definitions unless the task requires a shared configuration change. If setup blocks execution, inspect
[Dependencies](dependencies.md) and resolve setup within the authorized task scope.
Do not repair infrastructure as an incidental part of feature work.
Use this checkout's absolute application path for configure and execution, preserving
any monorepo subdirectory. Shared rules can live at a different returned rulesRoot;
edit shared infrastructure only when the task explicitly requires that project-wide change.

Worktree preparation is not completion. Continue through implementation, selected
verification and required repository checks. Auto mode uses the same selected evidence and required checks as the default.
Fix failures and rerun affected checks; if required verification is blocked or a
required review is pending, preserve the work and report the blocker without merging.
Scope restrictions still apply; auto mode does not approve pending Redpact reviews. Preserve evidence across iterations
and report unavailable execution rather than treating it as successful verification.

## Commit and finish

After successful verification, inspect the diff and stage only files belonging to the requested work. Make one coherent local commit by default, following repository commit conventions. Keep tests and implementation together unless independently useful changes justify separate commits. Do not commit unrelated user changes or runtime evidence.

Report the worktree path, branch, commit, observed red and green results, other checks, and applicable unit-run or integration run/environment IDs. Include scenario/checkpoints and any review-surface gaps; do not claim all evidence types were executed when only a subset was selected. Keep inspection environments running and include available endpoints. Worktree preparation or a plan alone is not completion of a feature request.

## Merge and cleanup

On a merge request, or after successful verification in explicit auto mode, carry
the work through target integration without asking for merge approval again or
ending at a verification/commit handoff. Check the commit list and diff against the
target to exclude unrelated changes before merging. Recheck source/target paths, branch heads and
working changes; a Redpact conflict record describes a past attempt. If the source
is already included in the target, verify and report that result without merging again.

Resolve textual conflicts autonomously when both changes' intent can be preserved.
Inspect automatically merged code for semantic conflicts too. When source resolution
is needed, integrate the current target into the source, preserve both changes, run
relevant checks and commit. Continue with `git merge --no-ff <task-branch>` in the
intended target checkout; do not stop at a clean source or ask the user to click
Merge again. Recheck the target before publication and verify ancestry and checkout
status afterward. If integration changes the verified tree, run the affected checks;
reuse passing evidence when the final tree is unchanged. Report the actual local
target branch, task and merge commit IDs, verification results and unresolved resource cleanup.

Request human review only when a concrete semantic conflict or unresolved material
risk requires a user decision. Explain the incompatible behaviors and decision
needed. Conflict markers alone do not require review, nor does an ordinary merge
require a separate review ceremony. Preserve unrelated changes and honor explicit
user limits such as resolve-only or no-merge. If current changes prevent safe
integration, report the specific blocker without discarding or committing them.

Merge and cleanup are separate. Keep a worktree while execution or resource cleanup is unfinished. Remove it with `git worktree remove <absolute-path>` and delete its merged branch with `git branch -d <task-branch>` only when cleanup is requested or no execution or unresolved cleanup needs it. If an environment still uses the worktree, defer worktree removal and direct the user to the web Environment screen. Never force-delete dirty worktrees, stop unrelated environments, or delete runtime history.
