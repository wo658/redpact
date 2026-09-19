import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const installer = join(root, "install.sh")

test("공개 설치기는 존재하며 알 수 없는 옵션을 설치 전에 거부한다", () => {
  expect(existsSync(installer)).toBe(true)
  const result = spawnSync("sh", [installer, "--unknown"], { encoding: "utf8" })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Unknown option")
})

test("두 에이전트의 공개 카탈로그가 같은 자체 포함 플러그인을 가리킨다", async () => {
  for (const file of [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]) {
    expect(existsSync(join(root, file)), file).toBe(true)
    const catalog = JSON.parse(await readFile(join(root, file), "utf8"))
    expect(catalog.name).toBe("redpact")
    const entry = catalog.plugins.find((plugin: { name: string }) => plugin.name === "redpact")
    expect(typeof entry.source === "string" ? entry.source : entry.source.path).toBe(
      "./plugins/redpact",
    )
  }
  const manifest = JSON.parse(
    await readFile(join(root, "plugins/redpact/.claude-plugin/plugin.json"), "utf8"),
  )
  expect(manifest.name).toBe("redpact")
})

test("체크섬 불일치 시 npm 설치를 실행하지 않는다", async () => {
  expect(existsSync(installer)).toBe(true)
  const temp = await mkdtemp(join(tmpdir(), "redpact-installer-test-"))
  try {
    const bin = join(temp, "bin")
    await mkdir(bin)
    await writeFile(
      join(bin, "curl"),
      '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n if [ "$1" = "-o" ]; then shift; output="$1"; fi\n shift\ndone\nprintf "corrupted" > "$output"\n',
    )
    await writeFile(join(bin, "npm"), `#!/bin/sh\ntouch "${temp}/npm-called"\n`)
    await chmod(join(bin, "curl"), 0o755)
    await chmod(join(bin, "npm"), 0o755)
    const result = spawnSync("sh", [installer, "--prefix", join(temp, "install")], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("checksum")
    expect(existsSync(join(temp, "npm-called"))).toBe(false)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test("설치 스크립트는 POSIX 셸 문법을 사용한다", () => {
  expect(existsSync(installer)).toBe(true)
  expect(() => execFileSync("sh", ["-n", installer])).not.toThrow()
})
