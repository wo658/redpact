import type { ChangeRoot } from "../../core/types/changes.js"

export const projectExclusions = [
  /(?:^|\/)(?:node_modules|dist|coverage|\.next|\.codex|\.pnpm-store|objects|logs)(?:\/|$)/,
]

export function changeExclusions(kind: ChangeRoot["kind"]): RegExp[] {
  if (kind === "checkout") {
    return [
      /(?:^|\/)(?:\.git|node_modules|\.codex|\.pnpm-store|dist|\.next|coverage)(?:\/|$)/,
      /^\.redpact\/runtime(?:\/|$)/,
    ]
  }
  if (kind === "git" || kind === "git-private" || kind === "git-shared") {
    const allowed = {
      "git-private": "HEAD|index|config|commondir",
      "git-shared": "refs|packed-refs|config|logs",
      git: "HEAD|index|refs|packed-refs|config|commondir|worktrees|logs",
    }[kind]
    return [
      new RegExp(`^(?!(?:${allowed})(?:/|$)).+`),
      /^logs\/(?!refs(?:\/|$)).+/,
      /^logs\/refs\/(?!heads(?:\/|$)).+/,
    ]
  }
  if (kind === "records") {
    return [/(?:^|\/)\.[^/]+/, /^[^/]+\/(?!state\.json$).+/]
  }
  return [
    /^(?!(?:projects|worktrees|submissions|runs|environments|previews|worktree-selections)(?:\/|$)).+/,
    /^runs\/[^/]+\/(?!state\.json$).+/,
  ]
}
