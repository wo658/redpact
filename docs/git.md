---
title: Projects and Git
description: Checkout discovery, comparisons, creation, local merge and GitHub publication.
---

# Projects and Git

## Identity and discovery

A project is a repository plus its project-relative subdirectory, or a connected
ordinary directory. A worktree identifies one actual checkout; the primary checkout
and linked checkouts share project rules. Native Git registrations supply live
availability. Branch changes do not replace historical execution identity.
A connected directory that becomes Git-backed is recognized by observation.

Opening a project folder uses the native directory picker. Folder selection and
Git discovery do not create branches, execute project code or provision containers.
Instance observed roots control discovery. Removed folders retain historical results
but cannot execute. A branch-only sidebar entry shows committed changes without
creating a checkout or exposing execution controls.

`tracking.json` selects the comparison main branch and sidebar visibility. Main and
dirty-worktree visibility follow the tracking service. Include local branches is
optional; branch rows supplement rather than duplicate live worktrees.

## Project management

Open **Manage projects** from the project switcher or the empty startup screen.
Search connected or disconnected projects by name or primary-folder path. Rows show
the folder, Git/directory kind and folder availability. **Connect project** uses the
native folder picker and lets you set a display name. Connecting the same canonical
project reuses its identity; an existing display name is preserved.

**Rename** changes only the instance's display name, including open project tabs.
Project settings still owns execution configuration. Folder moves, repository creation,
cloning and permanent history deletion are not project-management operations.

**Disconnect** requires confirmation and keeps source files, settings, worktrees,
credentials and execution history. It removes the project from the switcher, closes
its workspace tabs and stops automatic observation and new execution. The last
disconnection returns to startup, where management remains available. The stored
disconnected state survives restart; observed-root configuration cannot implicitly
reconnect it. Finish active Unit/Integration/Playwright and Git operations, resolve
unfinished worktree creation, and stop owned environments/cleanup before disconnecting.

The **Disconnected** list offers **View history** and **Reconnect**. Reconnection
validates the original directory and reuses the project/worktree IDs and name. An
unavailable folder stays distinct from an intentionally disconnected project;
restore its original location before reconnecting. History is retained, not deleted.

HTTP uses `PATCH /api/projects/:id` for the display name, `DELETE /api/projects/:id`
for disconnection and `POST /api/projects/:id/reconnect` for reconnection.
`GET /api/projects` lists connected projects; `includeDisconnected=true` adds retained
projects and folder availability. Mutations and execution admission share the
worktree lifecycle boundary. See the generated API for request/response schemas.

## Read-only comparisons

Native Git owns status and nested/global/shared exclude semantics for every index
format. Tracked changes remain visible even when a path matches an ignore rule.
Supported HEAD/index blob reads retain isomorphic-git with native fallback.
External diff, textconv, hooks, optional locks and fsmonitor are disabled for
inspection. Paths remain repository-relative and validated.

Worktree review compares against a usable branch-creation reflog commit, otherwise
the configured main branch's merge base. It includes committed, staged, unstaged
and untracked changes. Missing or ambiguous comparison state yields diagnostics;
it is not an empty diff. Branch-only comparison uses committed changes only.
Source/diff wrapping is a global display preference and preserves source characters,
line numbers and statistics.

Image comparisons follow the shared [file preview contract](frontend.md#file-content-previews),
including explicit commit revisions, rename paths and distinct staged/unstaged bytes.

## Git Graph and Fetch

Git Graph shows bounded commit history with branch filtering, remote visibility,
loaded-commit search and selected-commit file diffs. Opening and browsing are read-only.
Fetch explicitly updates remote-tracking branches with destination refspecs for
configured remotes. It never merges, pushes, prunes, fetches tags or changes local
branches/index/files. Requests serialize per common Git directory and report missing
remotes, busy state and partial failure. Refresh history after success or failure.
Pull and Push are not available in this toolbar.

## Managed worktree creation

`POST /api/work-starts` accepts `requestId`, `projectId`, `intent`, `baseRef`, `branch`
and an absolute `path`. Creation is a separate native Git adapter operation, not a
side effect of inspection. It pins the source revision and planned identities before
creating/attaching the checkout. `GET /api/work-starts/:id` reports recovery progress.

Reusing the same request ID with identical inputs recovers the same operation;
different inputs conflict. Existing branch/path collisions must be inspected, not
removed automatically. Partial creation preserves durable state for recovery and
never claims unobserved outputs. Use a retained project-owned worktree directory;
`/tmp` is only for disposable test fixtures.

## Local commit and merge

The worktree toolbar inspects uncommitted changes before Commit or Discard. Commit
includes the inspected staged, unstaged and untracked changes. Discard requires
explicit confirmation and can delete listed untracked files. Freshness checks reject
changes since inspection; neither action automatically merges afterward.

Merge targets the configured main branch's actual checkout. Dirty source or target,
stale revisions and unresolved state block admission. Candidate conflicts are kept
away from source/target files. Durable attempts preserve input heads and outcomes;
retrying an identical request is idempotent. Interrupted or conflicting attempts need
inspection and recovery, not blind repetition or branch deletion.

| HTTP | Action |
| --- | --- |
| `GET /api/worktrees/:id/merge` | Inspect source, target, blockers and history |
| `POST /api/worktrees/:id/git/commit` | Commit inspected `{ revision, message }` |
| `POST /api/worktrees/:id/git/discard` | Discard inspected `{ revision }` after confirmation |
| `POST /api/worktrees/:id/merge` | Merge `{ requestId, sourceRevision, targetRevision }` |

An agent resolving conflicts works in the source checkout, rechecks the target,
tests and commits the resolution before another authorized merge. Test approval does
not authorize Git merge. Dependency overlays require the separate reviewed
[promotion procedure](settings-reference.md).

## GitHub pull requests

PR opens a form showing source, origin and GitHub's default base branch. Opening
never pushes. Publication requires a clean named non-default branch and supported
same-repository github.com origin. The app reuses authenticated `gh` and Git
credentials; it does not store tokens or bundle another authentication system.
Global Settings can set an absolute `github.cliPath` and check the connection.

Publish pushes the inspected SHA to the same origin branch without force or tags,
then creates a PR. Existing open same-head/base PRs are reused. Push to PR updates
the branch without replacing its title/body. Source, revision and destination are
rechecked; a successful push followed by uncertain creation is reported distinctly,
and retry checks for the existing PR first.

Publication does not merge, auto-commit, fork or delete branches. Enterprise hosts,
SSH aliases, fork targets and ambiguous origin URLs are outside the current adapter.
GitHub's default PR base is independent of the local Merge target. GitHub owns PR
identity; there is no local PR database. Shutdown waits for active publication.

Implementation: [Git adapters](../app/server/src/adapters/git),
[merge workflow](../app/server/src/workflows/merge.ts),
[PR workflow](../app/server/src/workflows/pull-requests.ts),
[GitHub adapter](../app/server/src/adapters/github/pull-requests.ts).
