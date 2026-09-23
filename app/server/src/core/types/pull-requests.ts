import type { z } from "zod"
import type { publishPullRequestSchema } from "../pull-request-schema.js"

export type PullRequest = { number: number; url: string }
export type PullRequestTarget = {
  repository: string
  baseBranch: string
  branch: string
  head: string
  pushUrl: string
}
export type PullRequestInspection = PullRequestTarget & {
  revision: string
  title: string
  existing: PullRequest | null
}
export type PublishPullRequest = z.infer<typeof publishPullRequestSchema>
export type GitHubConnection = { login: string; cliPath: string }
export type GitHubPullRequests = {
  connection(): Promise<GitHubConnection>
  inspect(
    root: string,
    branch: string,
    head: string,
  ): Promise<Omit<PullRequestInspection, "revision">>
  push(root: string, target: PullRequestTarget): Promise<void>
  find(root: string, target: PullRequestTarget): Promise<PullRequest | null>
  create(root: string, target: PullRequestTarget, title: string, body: string): Promise<PullRequest>
}
export type PullRequestService = {
  connection(): Promise<GitHubConnection>
  inspect(id: string): Promise<PullRequestInspection>
  publish(id: string, input: PublishPullRequest): Promise<PullRequest>
  busy(ids?: string[]): boolean
  close(): Promise<void>
}
