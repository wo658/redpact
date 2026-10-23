import assert from "node:assert/strict"
import { test } from "node:test"
import { selectReleaseVersion } from "./version.mjs"

test("main의 새 커밋은 마지막 안정 릴리스에서 패치 버전을 올린다", () => {
  assert.equal(selectReleaseVersion("0.10.0", ["v0.10.0", "v0.11.0-beta.1"]), "0.10.1")
  assert.equal(selectReleaseVersion("0.9.0", ["v0.10.9", "v0.10.10"]), "0.10.11")
})

test("미리 준비한 더 높은 minor 버전은 보존한다", () => {
  assert.equal(selectReleaseVersion("0.11.0", ["v0.10.0"]), "0.11.0")
  assert.equal(selectReleaseVersion("0.1.0", []), "0.1.0")
})

test("안정 버전 자동 배포는 prerelease나 잘못된 버전을 거부한다", () => {
  for (const version of ["0.11.0-beta.1", "v0.11.0", "01.2.3", "garbage"]) {
    assert.throws(() => selectReleaseVersion(version, []), /stable/)
  }
})
