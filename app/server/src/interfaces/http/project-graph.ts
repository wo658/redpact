import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import {
  commitDiff,
  fetchResult,
  graphPage,
  graphQuery,
  imageComparison,
  imageQuery,
  oid,
} from "../../core/git-graph-schema.js"
import { problem } from "../../core/problems.js"
import type { ProjectGraph } from "../../core/types/git-graph.js"
import { inputErrors, jsonResponse, localErrors, notFound } from "./docs/metadata.js"

export function projectGraphRoutes(service: ProjectGraph) {
  return new Hono()
    .get(
      "/projects/:id/git/image",
      describeRoute({
        operationId: "readCommittedImage",
        summary: "Compare bounded image blobs at explicit Git revisions",
        tags: ["Git"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(imageComparison, "Image comparison"),
        },
      }),
      async (c) => {
        const parsed = imageQuery.safeParse(c.req.query())
        if (!parsed.success) {
          problem("invalid_input", parsed.error.message)
        }
        c.header("Cache-Control", "no-store")
        return c.json(await service.image(c.req.param("id"), parsed.data))
      },
    )
    .post(
      "/projects/:id/git/fetch",
      describeRoute({
        operationId: "fetchProjectGitRemotes",
        summary: "Fetch remote branches without changing local branches or working files",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(fetchResult, "Fetched remotes"),
          409: { description: "A fetch is already running for this repository" },
          502: { description: "Git fetch failed or timed out" },
        },
      }),
      async (c) => c.json(await service.fetch(c.req.param("id"))),
    )
    .get(
      "/projects/:id/git/commits/:oid/diff",
      describeRoute({
        operationId: "getProjectCommitDiff",
        summary: "Read a commit against its first parent, or the empty tree for a root commit",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(commitDiff, "Committed file patch"),
        },
      }),
      async (c) => {
        const parsed = oid.safeParse(c.req.param("oid"))
        if (!parsed.success) {
          problem("invalid_input", "A full commit object ID is required")
        }
        c.header("Cache-Control", "no-store")
        return c.json(await service.diff(c.req.param("id"), parsed.data))
      },
    )
    .get(
      "/projects/:id/git/graph",
      describeRoute({
        operationId: "getProjectGitGraph",
        summary: "Read all branch histories without changing Git",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(graphPage, "Commit graph page"),
        },
      }),
      async (c) => {
        const parsed = graphQuery.safeParse({ ...c.req.query(), ref: c.req.queries("ref") })
        if (!parsed.success) {
          problem("invalid_input", parsed.error.message)
        }
        c.header("Cache-Control", "no-store")
        return c.json(await service.history(c.req.param("id"), parsed.data))
      },
    )
}
