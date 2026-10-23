import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

function captureNpmArguments(t, args) {
  const directory = mkdtempSync(join(tmpdir(), "redpact-runtime-inspection-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const recorded = join(directory, "arguments.json")
  const npm = join(directory, "npm")
  writeFileSync(
    npm,
    '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.RELEASE_ARGUMENTS_FILE, JSON.stringify(process.argv.slice(2)))\n',
  )
  chmodSync(npm, 0o755)
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../../app/server/tools/publish-runtime.mjs", import.meta.url)),
      ...args,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH}`,
        RELEASE_ARGUMENTS_FILE: recorded,
      },
    },
  )
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(readFileSync(recorded, "utf8"))
}

test("이미 게시된 런타임도 dry-run에서 npm pack으로 검사하고 lifecycle script를 실행하지 않는다", (t) => {
  const args = captureNpmArguments(t, ["--dry-run"])
  assert.equal(args[0], "pack")
  assert.match(args[1], /redpact-\d+\.\d+\.\d+\.tgz$/)
  assert.deepEqual(args.slice(2), ["--dry-run", "--ignore-scripts"])
})

test("실제 런타임 게시는 public npm registry publish 명령을 유지한다", (t) => {
  const args = captureNpmArguments(t, [])
  assert.equal(args[0], "publish")
  assert.deepEqual(args.slice(2), [
    "--access",
    "public",
    "--registry",
    "https://registry.npmjs.org/",
  ])
})
