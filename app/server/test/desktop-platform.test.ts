import { expect, test } from "vitest"

const { nodeArchiveCommand, runPnpm } = await import(
  new URL("../tools/runtime-commands.mjs", import.meta.url).href
)

test("Windows에서는 Git Bash tar 대신 시스템 ZIP 지원 tar를 사용한다", () => {
  expect(nodeArchiveCommand("win32", "C:\\Windows")).toBe("C:\\Windows\\System32\\tar.exe")
  expect(nodeArchiveCommand("linux")).toBe("tar")
  expect(nodeArchiveCommand("darwin")).toBe("tar")
})

test("패키징 명령은 공백과 셸 문자가 있는 인자를 그대로 전달한다", () => {
  const argument = "a b & echo unwanted"
  const result = runPnpm(["exec", "node", "-e", "console.log(process.argv[1])", argument], {
    cwd: process.cwd(),
  })
  expect(result.stdout.trim()).toBe(argument)
})
