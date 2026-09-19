import { mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test as vitestTest } from "vitest"
import { snapshotComposeInputs } from "../src/adapters/environment/compose-inputs.js"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { executionSettingsSchema } from "../src/core/execution-settings.js"

const test = process.env.REDPACT_DOCKER_TESTS === "1" ? vitestTest : vitestTest.skip
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "compose-inputs-"))
  roots.push(root)
  await mkdir(join(root, "app"))
  await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    build: ./app\n")
  await writeFile(join(root, "app/Dockerfile"), "FROM scratch\nCOPY . /app\n")
  await writeFile(join(root, "app/source.txt"), "original")
  const settings = executionSettingsSchema.parse({
    environment: { compose: { files: ["compose.yaml"] } },
    tests: {},
  })
  const plan = {
    activeServices: ["app"],
    excludedServices: [],
    reasons: { app: [] },
    requiredSecrets: [],
    bindings: { app: {} },
    prerequisites: { app: {} },
  }
  const adapter = createComposeAdapter(join(root, "runtime"))
  return {
    root,
    inputs: { settings, plan },
    fingerprint: () => adapter.fingerprint(root, { settings, plan }),
  }
}

test("Compose build contexts exclude unrelated project files before source inspection", async () => {
  const { root, fingerprint } = await fixture()
  const original = await fingerprint()
  await symlink("/unavailable-outside-project", join(root, "unrelated-link"))
  await expect(fingerprint()).resolves.toBe(original)
  await writeFile(join(root, "app/source.txt"), "edited")
  await expect(fingerprint()).resolves.not.toBe(original)
})

test("Docker ignores and symlink identity determine application inputs", async () => {
  const { root, fingerprint } = await fixture()
  await writeFile(join(root, "app/.dockerignore"), "cache\n!cache/keep.txt\n")
  await mkdir(join(root, "app/cache"))
  await writeFile(join(root, "app/cache/keep.txt"), "keep")
  await symlink("/missing", join(root, "app/cache/link"))
  const original = await fingerprint()
  await writeFile(join(root, "app/cache/noise.txt"), "ignored")
  await expect(fingerprint()).resolves.toBe(original)
  await writeFile(join(root, "app/cache/keep.txt"), "changed")
  await expect(fingerprint()).resolves.not.toBe(original)
  await symlink("source.txt", join(root, "app/source-link"))
  await expect(fingerprint()).resolves.toMatch(/^[a-f0-9]{64}$/)
})

test("Dockerfile-specific ignore replaces the context ignore file", async () => {
  const { root, fingerprint } = await fixture()
  await writeFile(join(root, "app/.dockerignore"), "source.txt\n")
  await writeFile(join(root, "app/Dockerfile.dockerignore"), "noise.txt\n")
  const original = await fingerprint()
  await writeFile(join(root, "app/noise.txt"), "ignored")
  await expect(fingerprint()).resolves.toBe(original)
  await writeFile(join(root, "app/source.txt"), "edited")
  await expect(fingerprint()).resolves.not.toBe(original)
})

test("image-only services never inspect unrelated source trees", async () => {
  const { root, fingerprint } = await fixture()
  await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    image: busybox:1.37\n")
  const original = await fingerprint()
  await symlink("/missing", join(root, "app/source-link"))
  await writeFile(join(root, "app/source.txt"), "edited")
  await expect(fingerprint()).resolves.toBe(original)
})

test("capture preserves link text and filters files before copying", async () => {
  const { root, inputs, fingerprint } = await fixture()
  await writeFile(join(root, "app/.dockerignore"), "discard\n")
  await mkdir(join(root, "app/discard"))
  await symlink("/missing", join(root, "app/discard/link"))
  await symlink("/missing-outside-context", join(root, "app/source-link"))
  const stage = await mkdtemp(join(tmpdir(), "compose-captured-"))
  roots.push(stage)
  const digest = await fingerprint()
  await expect(snapshotComposeInputs(root, inputs, stage)).resolves.toBe(digest)
  expect(await readlink(join(stage, "app/source-link"))).toBe("/missing-outside-context")
  expect(await readFile(join(stage, "app/source.txt"), "utf8")).toBe("original")
  await expect(readFile(join(stage, "app/discard/link"))).rejects.toMatchObject({ code: "ENOENT" })
  await rm(join(root, "app/source-link"))
  await symlink("different-target", join(root, "app/source-link"))
  await expect(fingerprint()).resolves.not.toBe(digest)
})

test("Compose resolves selected merged build contexts relative to its first file", async () => {
  const { root, inputs } = await fixture()
  await mkdir(join(root, "deploy"))
  await writeFile(
    join(root, "deploy/compose.yaml"),
    "services:\n  app:\n    build: ../missing\n  inactive:\n    build: ../unavailable\n",
  )
  await writeFile(
    join(root, "override.yaml"),
    "services:\n  app:\n    build:\n      context: ../app\n",
  )
  inputs.settings.environment.compose.files = ["deploy/compose.yaml", "override.yaml"]
  const before = await snapshotComposeInputs(root, inputs)
  await writeFile(join(root, "app/source.txt"), "edited")
  await expect(snapshotComposeInputs(root, inputs)).resolves.not.toBe(before)
})

test("build contexts and control files cannot read through host symlinks", async () => {
  const { root, fingerprint } = await fixture()
  await symlink("/etc/passwd", join(root, "app/.dockerignore"))
  await expect(fingerprint()).rejects.toThrow("Docker ignore file must be a regular file")
  await rm(join(root, "app/.dockerignore"))
  await symlink("app", join(root, "linked-app"))
  await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    build: ./linked-app\n")
  await expect(fingerprint()).rejects.toThrow(
    "Build context paths must not traverse symbolic links",
  )
})

test("re-included files preserve their excluded parent directory permissions", async () => {
  const { root, inputs } = await fixture()
  await mkdir(join(root, "app/assets"), { mode: 0o755 })
  await writeFile(join(root, "app/assets/keep.txt"), "visible")
  await writeFile(join(root, "app/.dockerignore"), "assets\n!assets/keep.txt\n")
  const stage = await mkdtemp(join(tmpdir(), "compose-permissions-"))
  roots.push(stage)
  await snapshotComposeInputs(root, inputs, stage)
  expect((await stat(join(stage, "app/assets"))).mode & 0o777).toBe(0o755)
})
