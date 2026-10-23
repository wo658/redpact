---
title: Projects and Git
description: Checkout discovery, read-only review and agent-owned Git operations.
---

# Projects and Git

The viewer supports source identity and read-only review while agents own Git writes
and publication. Uncommitted, Merge, PR and Fetch controls are absent from the UI.
Agents use host Git/`gh` tools within their authorized scope; existing backend HTTP
workflows below remain available. UI removal does not remove those APIs or grant
permission for a write. See [product scope](architecture.md).

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

With **Hide merged** enabled, clean worktrees are hidden when their HEAD is an
ancestor of the configured local main branch. For a github.com `origin`, Redpact
also checks merged PRs through authenticated `gh` (using Global Settings'
`github.cliPath` when configured). A PR counts only when its source repository,
branch and exact head SHA match, its base is the configured main branch, and its
merge-result commit is already an ancestor of that local branch. This recognizes
squash and rebase PR merges without changing Git history or fetching automatically.
A merged PR on GitHub alone does not establish local integration.

The same check supplies branch-only merge status. New commits, dirty worktrees,
detached unmerged checkouts and the main checkout remain visible. Unsupported
origins, unavailable GitHub authentication, malformed responses and lookup failures
leave unconfirmed work visible; local ancestry checks continue to work offline.
Remote lookup results are shared for up to 30 seconds in a bounded in-memory cache;
local heads, target ancestry and dirty state are rechecked before hiding anything.
No PR database or new persisted settings are introduced. Fork and non-github.com
PR evidence are outside this fallback. Existing **Hide merged** preferences still
control visibility; no branch or checkout is deleted.

## Project management

Open **Manage projects** from the project switcher or the empty startup screen.
Search connected or disconnected projects by name or primary-folder path. Rows show
the folder, Git/directory kind and folder availability. **Connect project** uses the
native folder picker and lets you set a display name. Connecting the same canonical
project reuses its identity; an existing display name is preserved.

**Rename** changes only the instance's display name in project navigation.
Project settings still owns execution configuration. Folder moves, repository creation,
cloning and permanent history deletion are not project-management operations.

**Disconnect** requires confirmation and keeps source files, settings, worktrees,
credentials and execution history. It removes the project from the switcher and
stops automatic observation and new execution. If it was selected, navigation moves
to another connected project. The last
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

Git queries and worktree, branch and commit diffs default to a 128 MiB output bound
per stdout/stderr stream per invocation. Set the server process environment variable
`REDPACT_GIT_MAX_BUFFER_MIB` to an integer from 1 to 2048 to override it, for example
`REDPACT_GIT_MAX_BUFFER_MIB=256 redpact serve --port 54322`. Restart the server after changes.
Memory grows with output rather than reserving the entire bound; concurrent commands
and diff rendering consume additional memory. Separate image, individual untracked-file
preview and bounded metadata-query limits remain unchanged. The commit patch and
file-list bounds below also follow this setting.

## Git Graph and Fetch

Git Graph shows bounded commit history with branch filtering, remote visibility,
loaded-commit search and selected-commit file diffs. Opening and browsing are read-only.
The header's Refresh action rereads local history; it does not fetch from a remote.
There is no viewer Fetch, Pull or Push button.

The graph uses actual commit parents, as conventional Git graphs do. A merge commit
connects its parent histories; a squash PR produces a single-parent commit, and a
rebase PR produces rewritten commits in linear history. Neither creates a merge edge
to the original branch. PR numbers already in commit subjects, such as `(#29)`, remain
visible; the graph does not query a hosting provider for PR metadata. Retained source
branches may therefore remain on a separate lane after a squash merge.

Search covers loaded commits only. Load more history to search older commits, or use
the branch filter to narrow the history being loaded. Refresh rereads existing local
refs; remote-only history requires an explicit host Git fetch first.

The retained backend Fetch operation explicitly updates remote-tracking branches
with destination refspecs for configured remotes. It never merges, pushes, prunes, fetches tags or changes local
branches/index/files. Requests serialize per common Git directory and report missing
remotes, busy state and partial failure. Clients refresh history after success or failure.

Commit patches are limited to 128 MiB. Larger patches return HTTP 200 with
`patchOmitted: "size_limit"`, an empty `patch`, the `changedPaths` list and an explicit
`omitted` diagnostic. Git Graph keeps commit metadata and displays the file paths
with a size-limit notice; it does not present truncated content as a complete diff.
The file-name response has its own 128 MiB Git output bound. If it also exceeds that
bound, HTTP 200 retains commit identity with `changedPathsOmitted: "size_limit"`
and a separate diagnostic; no partial file list is returned or shown.

## Existing checkouts and retained creation records

The host agent creates Git worktrees with native Git. Redpact discovers, validates
and connects existing checkouts; it never creates a branch or checkout as part of
connection. `POST /api/projects/:id/worktrees` connects an existing checkout belonging
to that project. Use a retained project-owned directory for development worktrees;
`/tmp` is only for disposable test fixtures.

`POST /api/work-starts` has been removed and returns 404. Clients must create the
checkout through host Git tools, then connect its path. There is no creation or
resume command in the CLI or MCP.

`GET /api/work-starts/:id` remains a read-only view of historical creation records.
Original inputs, planned IDs and `prepared`, `attempted`, `created` or `completed`
states remain unchanged; they describe past observations, not active reservations.
Incomplete records no longer hide discovered checkouts or block project disconnection.
Active executions and owned environments still enforce their existing admission rules.

Inspect any uncertain historical creation with `git worktree list` and the recorded
path. Connect a valid checkout normally; do not retry creation through Redpact.
Connection preserves existing checkout bindings and evidence; a newly discovered
checkout receives its own binding rather than claiming unused IDs from an old request.
Redpact does not delete historical records, branches or checkout files, or mark an
uncertain creation as completed. See [runtime data](storage.md).

## Local commit and merge

The viewer has no Uncommitted, Commit, Discard or Merge controls. Agents inspect
changes through host tools before authorized writes. The retained backend Commit
operation includes inspected staged, unstaged and untracked changes. Discard requires
explicit authorization and can delete listed untracked files. Backend freshness checks
reject changes since inspection; neither operation automatically merges afterward.

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
not authorize Git merge. All worktrees use the shared fixed configuration described
in [settings ownership](settings-reference.md); there is no dependency-overlay promotion step.

## GitHub pull requests

The viewer has no PR form or publication button. Agents inspect the source, origin
and target branch before authorized publication using host tools. The retained backend
publication workflow requires a clean named non-default branch and supported
same-repository github.com origin. It reuses authenticated `gh` and Git credentials;
it does not store tokens or bundle another authentication system.
Global Settings can set an absolute `github.cliPath` and check the connection.

The backend publication operation pushes the inspected SHA to the same origin branch without force or tags,
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
