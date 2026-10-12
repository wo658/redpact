import type { z } from "zod"
import type { graphPage, graphQuery } from "../git-graph-schema.js"
import type { GitDiff, GitImage, GitImageQuery } from "./git.js"
export type GraphQuery = z.infer<typeof graphQuery>
export type GraphPage = z.infer<typeof graphPage>
export type ProjectGraph = {
  busy(id: string): boolean
  image(id: string, query: GitImageQuery): Promise<GitImage>
  fetch(id: string): Promise<{ remotes: string[] }>
  history(id: string, query: GraphQuery): Promise<GraphPage>
  diff(id: string, oid: string): Promise<GitDiff>
}
