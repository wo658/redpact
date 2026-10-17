import { expect, test } from "vitest"
import { collectRunnerOutput } from "../src/adapters/environment/runner-output.js"

test("누적 출력은 중복 없이 전달하며 다음 청크의 UTF-8 문자를 보존한다", () => {
  let stdout = "",
    stderr = ""
  const collect = collectRunnerOutput(
    (chunk) => {
      stdout += chunk
    },
    (chunk) => {
      stderr += chunk
    },
  )
  collect({ stdout: "hello �", stderr: "failure", truncated: false })
  expect(stdout).toBe("hello ")
  collect({ stdout: "hello 한글", stderr: "failure marker", truncated: false })
  collect({ stdout: "hello 한글", stderr: "failure marker", truncated: false }, true)
  expect(stdout).toBe("hello 한글")
  expect(stderr).toBe("failure marker")
})
