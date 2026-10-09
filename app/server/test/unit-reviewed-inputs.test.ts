import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createUnitContainer } from "../src/adapters/environment/unit-container.js"

test("Unit 컨테이너는 실제 복사한 소스가 승인 digest와 다르면 Docker 실행 전에 거부한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-unit-reviewed-"))
  const root = join(directory, "project")
  await mkdir(root)
  await writeFile(join(root, "Dockerfile"), "FROM alpine:3.21\n")
  const command = createUnitContainer(join(directory, "data"), randomUUID())
  const run = {
    id: randomUUID(),
    projectRoot: root,
    runtimeId: null,
    settings: {
      dockerfile: "Dockerfile",
      cwd: ".",
      command: "echo never-executed",
      patterns: ["unit/*.ts"],
    },
    inputDigest: "different-reviewed-source",
  }
  const observe = vi.fn()
  try {
    await expect(
      command.execute(run as never, new AbortController().signal, observe),
    ).rejects.toThrow("Unit sources changed during review")
    expect(observe).not.toHaveBeenCalled()
    await command.stop(run as never)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
