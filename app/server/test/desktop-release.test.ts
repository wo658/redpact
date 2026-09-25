import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { parse } from "yaml"

const { releaseEnvironment } = await import(
  new URL("../../desktop/tools/release-config.mjs", import.meta.url).href
)
const publicKey = Buffer.from(
  `untrusted comment: test key\n${Buffer.alloc(42).toString("base64")}`,
).toString("base64")
const config = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: ["https://github.com/wo658/redpact/releases/latest/download/latest.json"],
    },
  },
}
const input = { version: "0.1.0", tag: "v0.1.0", config, privateKey: "secret" }

test("저장소 릴리스 설정에 실제 공개 검증 키와 공개 다운로드 주소가 포함된다", async () => {
  const releaseConfig = JSON.parse(
    await readFile(
      new URL("../../desktop/src-tauri/tauri.release.conf.json", import.meta.url),
      "utf8",
    ),
  )
  const environment = releaseEnvironment({ ...input, config: releaseConfig })
  expect(environment.REDPACT_UPDATE_ENDPOINT).toBe(config.plugins.updater.endpoints[0])
  const keyLines = Buffer.from(environment.REDPACT_UPDATE_PUBLIC_KEY, "base64")
    .toString("utf8")
    .trim()
    .split("\n")
  expect(Buffer.from(keyLines[1], "base64").subarray(0, 2).toString()).toBe("Ed")
})

test("릴리스 버전과 공개 키를 native updater 빌드에 전달하고 비공개 키는 반환하지 않는다", () => {
  expect(releaseEnvironment(input)).toEqual({
    REDPACT_UPDATE_ENDPOINT: config.plugins.updater.endpoints[0],
    REDPACT_UPDATE_PUBLIC_KEY: publicKey,
  })
})
test("다른 버전이나 prerelease 태그는 stable feed에 배포하지 않는다", () => {
  for (const tag of ["v0.2.0", "desktop-v0.1.0", "v0.1.0-beta.1"]) {
    expect(() => releaseEnvironment({ ...input, tag })).toThrow("tag")
  }
})

test("제품 태그 하나가 macOS, Windows와 npm 공개를 함께 실행한다", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/desktop-release.yml", import.meta.url),
    "utf8",
  )
  expect(workflow).toContain("tags: ['v*']")
  expect(workflow).toContain("target: x86_64-pc-windows-msvc")
  expect(workflow).toContain("id-token: write")
  expect(workflow).toContain("node app/server/tools/publish-runtime.mjs")
  const jobs = parse(workflow).jobs
  for (const name of ["publish-desktop", "publish-npm"]) {
    expect(jobs[name].needs).toEqual(expect.arrayContaining(["build", "verify-npm"]))
  }
})

test("npm 게시 작업은 검증된 아티팩트를 받아 재빌드 없이 게시한다", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../../.github/workflows/desktop-release.yml", import.meta.url),
      "utf8",
    ),
  )
  const steps = workflow.jobs["publish-npm"].steps
  expect(
    steps.some((step: { uses?: string }) => step.uses === "actions/download-artifact@v4"),
  ).toBe(true)
  expect(
    steps.some((step: { run?: string }) =>
      /pack:runtime|test:package|pnpm install/.test(step.run ?? ""),
    ),
  ).toBe(false)
})

test("무거운 npm 설치 검증은 릴리스에서만 호출하고 지원 환경 전체를 검사한다", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../../.github/workflows/runtime-verification.yml", import.meta.url),
      "utf8",
    ),
  )
  expect(Object.keys(workflow.on)).toEqual(["workflow_call"])
  expect(workflow.jobs.install.needs).toBe("package")
  expect(workflow.jobs.install.strategy.matrix).toEqual({
    runner: ["ubuntu-latest", "macos-14", "macos-15-intel", "windows-2022"],
    node: [24, 26],
  })
  const manual = parse(
    await readFile(new URL("../../../.github/workflows/npm-publish.yml", import.meta.url), "utf8"),
  )
  expect(manual.jobs.publish.needs).toBe("verify-npm")
  expect(manual.jobs["verify-npm"].uses).toBe("./.github/workflows/runtime-verification.yml")
})

test("검증 후 tarball 내용이나 소스·버전이 바뀌면 게시를 거부한다", async () => {
  const { verifyIdentity } = await import(
    new URL("../tools/runtime-artifact.mjs", import.meta.url).href
  )
  const expected = { version: "0.6.0", commit: "source-sha", sha256: "tarball-sha256" }
  expect(() => verifyIdentity({ ...expected }, expected)).not.toThrow()
  for (const key of ["version", "commit", "sha256"]) {
    expect(() => verifyIdentity({ ...expected, [key]: "changed" }, expected)).toThrow("mismatch")
  }
})
test("서명 키나 서명 아티팩트 설정이 없으면 빌드를 차단한다", () => {
  expect(() => releaseEnvironment({ ...input, privateKey: "" })).toThrow("private key")
  expect(() => releaseEnvironment({ ...input, config: { ...config, bundle: {} } })).toThrow(
    "artifacts",
  )
  expect(() =>
    releaseEnvironment({
      ...input,
      config: {
        ...config,
        plugins: { updater: { ...config.plugins.updater, pubkey: "placeholder" } },
      },
    }),
  ).toThrow("public key")
})
test("다른 저장소나 안전하지 않은 feed를 거부한다", () => {
  for (const endpoint of [
    "http://github.com/wo658/redpact/releases/latest/download/latest.json",
    "https://example.com/latest.json",
  ]) {
    expect(() =>
      releaseEnvironment({
        ...input,
        config: {
          ...config,
          plugins: { updater: { ...config.plugins.updater, endpoints: [endpoint] } },
        },
      }),
    ).toThrow("endpoint")
  }
})

test("수동 Mac preview는 updater 키 없이 일치하는 버전만 배포한다", () => {
  expect(
    releaseEnvironment({
      ...input,
      tag: "desktop-preview-v0.1.0",
      mode: "preview",
      privateKey: "",
    }),
  ).toEqual({})
  expect(() =>
    releaseEnvironment({
      ...input,
      tag: "desktop-preview-v0.2.0",
      mode: "preview",
      privateKey: "",
    }),
  ).toThrow("tag")
})
