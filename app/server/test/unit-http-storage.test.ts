import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createSettingsFiles } from "../src/adapters/settings/editor-files.js"
import { readJsonSettings } from "../src/adapters/settings/json.js"
import { createUnitTestFiles } from "../src/adapters/sources/unit-tests.js"
import { createUnitRunStore } from "../src/adapters/storage/unit-runs.js"
import { createApp } from "../src/app.js"
import type { UnitCommand } from "../src/core/types/unit-tests.js"
import { createSettingsEditor } from "../src/workflows/settings-editor.js"
import { createUnitTests } from "../src/workflows/unit-tests.js"
import { resourceLimit } from "./helpers/resource-limit.js"

test.each([false, true])(
  "HTTP preserves unit execution evidence after restart (limited=%s)",
  async (limited) => {
    const root = await mkdtemp(join(tmpdir(), "unit-http-"))
    try {
      await mkdir(join(root, ".redpact"))
      await writeFile(join(root, "unit.Dockerfile"), "FROM alpine:3.21\n")
      const file = join(root, ".redpact/settings.json")
      const editor = createSettingsEditor({
        projects: { root: async () => root },
        directory: root,
        files: createSettingsFiles(),
        validateProject: (path, source) => readJsonSettings(path, undefined, { file, source }),
      })
      await editor.saveProject("p", {
        revision: null,
        source: JSON.stringify({
          composeFiles: [],
          unitTests: {
            dockerfile: "unit.Dockerfile",
            command: "printf 'unit-only'",
            cwd: ".",
            patterns: ["unit/**/*.test.ts"],
          },
        }),
      })
      expect((await readJsonSettings(root)).valid).toBe(true)
      const deps = {
        worktrees: {
          resolve: async () => ({
            worktree: { id: "w", projectId: "p", projectRoot: root },
            git: {
              mergeBase: async () => {
                throw new Error("No Git")
              },
            },
          }),
        },
        projects: { tracking: async () => ({ mainBranch: null, hideMerged: false }) },
        settings: editor,
        files: createUnitTestFiles(),
        command: {
          execute: async () => ({
            outcome: limited ? "execution_error" : "command_succeeded",
            ...(limited ? { resourceLimit } : {}),
            exitCode: 0,
            stdout: "unit-only",
            stderr: "",
            error: limited ? "Memory limit exceeded" : null,
            truncated: false,
          }),
          stop: async () => {},
        } satisfies UnitCommand,
        store: createUnitRunStore(root),
      }
      const service = createUnitTests(deps)
      const app = createApp({ unitTests: service } as never)
      const response = await app.request("/api/worktrees/w/unit-tests/run", { method: "POST" })
      expect(response.status).toBe(200)
      const run = await response.json()
      await expect.poll(() => service.get(run.id).state).toBe("finished")
      expect(service.get(run.id)).toMatchObject({
        outcome: limited ? "execution_error" : "command_succeeded",
        stdout: "unit-only",
      })
      await service.close()
      const restarted = createUnitTests({ ...deps, store: createUnitRunStore(root) })
      expect(restarted.get(run.id)).toEqual(service.get(run.id))
      const listing = await (await app.request("/api/worktrees/w/unit-tests")).json()
      expect(listing.catalog.diagnostics).toEqual(["No Git"])
      expect(listing.runs[0].id).toBe(run.id)
      expect(listing.runs[0].resourceLimit).toEqual(limited ? resourceLimit : undefined)
      expect((await app.request("/api/unit-runs/missing")).status).toBe(404)
      expect(
        (
          await app.request("/api/worktrees/w/unit-tests/run", {
            method: "POST",
            headers: { Origin: "https://example.com" },
          })
        ).status,
      ).toBe(403)
      await writeFile(
        join(root, "unit-runs", `${run.id}.json`),
        JSON.stringify({ ...run, version: 99 }),
      )
      expect(() => createUnitRunStore(root).list()).toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
