import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { parse } from "yaml"

test("npm 게시 작업은 검증된 아티팩트를 받아 재빌드 없이 게시한다", async () => {
  const workflow = parse(
    await readFile(new URL("../../../.github/workflows/npm-publish.yml", import.meta.url), "utf8"),
  )
  const steps = workflow.jobs.publish.steps
  expect(
    steps.some((step: { uses?: string }) => step.uses === "actions/download-artifact@v4"),
  ).toBe(true)
  expect(
    steps.some((step: { run?: string }) =>
      /pack:runtime|test:package|pnpm install/.test(step.run ?? ""),
    ),
  ).toBe(false)
})

test("npm 릴리스는 단일 Linux 환경에서 패키지를 검증하고 OS 매트릭스를 실행하지 않는다", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../../.github/workflows/runtime-verification.yml", import.meta.url),
      "utf8",
    ),
  )
  expect(Object.keys(workflow.on)).toEqual(["workflow_call"])
  expect(Object.keys(workflow.jobs)).toEqual(["package"])
  expect(workflow.jobs.package["runs-on"]).toBe("ubuntu-latest")
  expect(workflow.jobs.package.steps).toContainEqual({ run: "pnpm test:package" })
  const manual = parse(
    await readFile(new URL("../../../.github/workflows/npm-publish.yml", import.meta.url), "utf8"),
  )
  expect(manual.jobs.publish.needs).toEqual(["prepare", "verify-npm"])
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

test("자동 앱 CI는 웹과 서버만 검증하고 무거운 플러그인 검증은 수동으로 실행한다", async () => {
  const application = parse(
    await readFile(new URL("../../../.github/workflows/server.yml", import.meta.url), "utf8"),
  )
  expect(Object.keys(application.jobs)).toEqual(["verify"])
  const commands = application.jobs.verify.steps
    .map((step: { run?: string }) => step.run)
    .filter(Boolean)
  expect(commands).toContain("pnpm --filter @redpact/web build")
  expect(commands).toContain("pnpm --filter @redpact/server typecheck")
  expect(commands).toContain("pnpm --filter @redpact/server test")
  expect(commands).toContain("pnpm --filter @redpact/web test")
  expect(commands).toContain("pnpm plugins:check --registry")
  expect(application.on.pull_request.paths).toContain(".agents/plugins/**")
  expect(application.on.push.paths).toContain(".agents/plugins/**")
  expect(commands).not.toContain("pnpm build")
  const plugin = parse(
    await readFile(
      new URL("../../../.github/workflows/plugin-verification.yml", import.meta.url),
      "utf8",
    ),
  )
  expect(Object.keys(plugin.on)).toEqual(["workflow_dispatch"])
  expect(plugin.on.workflow_dispatch?.inputs?.publish?.default).toBe(false)
  expect(plugin.jobs.publish?.needs).toBe("verify")
  expect(plugin.jobs.publish?.["runs-on"]).toBe("ubuntu-latest")
  expect(plugin.jobs.publish?.permissions["id-token"]).toBe("write")
  const publishSteps = plugin.jobs.publish?.steps ?? []
  expect(publishSteps).toContainEqual({ run: "node tools/plugins/publish.mjs --dry-run" })
  expect(publishSteps).toContainEqual({
    name: "Publish with npm trusted publishing",
    if: "${{ inputs.publish }}",
    run: "node tools/plugins/publish.mjs",
  })
})

test("안정 버전 태그 push는 로그인 없이 OIDC로 검증된 패키지를 게시한다", async () => {
  const workflow = parse(
    await readFile(new URL("../../../.github/workflows/npm-publish.yml", import.meta.url), "utf8"),
  )
  expect(workflow.on.push?.tags).toEqual(["v*"])
  expect(workflow.on.push.branches).toEqual(["main"])
  expect(workflow.jobs["verify-npm"].if).toContain("needs.prepare.result == 'success'")
  expect(workflow.jobs["verify-npm"].if).toContain("!contains(github.ref_name, '-')")
  expect(workflow.jobs["verify-npm"].with["source-sha"]).toBe(
    "${{ needs.prepare.outputs.commit || github.sha }}",
  )
  expect(workflow.permissions).toEqual({ contents: "read" })
  expect(workflow.jobs.publish.permissions).toEqual({ contents: "write", "id-token": "write" })
  expect(workflow.jobs.publish.steps).toContainEqual({
    name: "Publish using npm trusted publishing",
    if: "${{ github.event_name == 'push' || (inputs.publish && github.ref_type == 'tag') }}",
    run: "node tools/release/publish.mjs",
  })
  expect(workflow.on.workflow_dispatch.inputs.publish.default).toBe(false)
})

test("dev는 검증만 하고 main은 같은 실행에서 버전·검증·태그·npm 게시를 순서대로 수행한다", async () => {
  const readWorkflow = async (name: string) =>
    parse(
      await readFile(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
    )
  const application = await readWorkflow("server")
  const docs = await readWorkflow("docs")
  expect(application.on.push.branches).toEqual(["dev", "main"])
  expect(docs.on.push.branches).toEqual(["dev", "main"])
  const workflow = await readWorkflow("npm-publish")
  expect(workflow.jobs.prepare.if).toContain("github.ref == 'refs/heads/main'")
  expect(workflow.jobs.prepare.permissions).toEqual({ contents: "write" })
  expect(workflow.jobs["verify-npm"].needs).toBe("prepare")
  expect(workflow.jobs.publish.if).toContain("needs.verify-npm.result == 'success'")
  const steps = workflow.jobs.publish.steps
  const tagIndex = steps.findIndex(
    (step: { run?: string }) => step.run === "node tools/release/tag.mjs",
  )
  const publishIndex = steps.findIndex(
    (step: { run?: string }) => step.run === "node tools/release/publish.mjs",
  )
  expect(tagIndex).toBeGreaterThan(
    steps.findIndex(
      (step: { run?: string }) => step.run === "node app/server/tools/runtime-artifact.mjs verify",
    ),
  )
  expect(publishIndex).toBeGreaterThan(tagIndex)
  const releaseIndex = steps.findIndex(
    (step: { run?: string }) => step.run === "node tools/release/github-release.mjs",
  )
  expect(releaseIndex).toBeGreaterThan(publishIndex)
  expect(steps[releaseIndex].if).toBe(steps[publishIndex].if)
  const verification = await readWorkflow("runtime-verification")
  expect(verification.jobs.package.steps[0].with.ref).toBe("${{ inputs.source-sha }}")
  expect(verification.jobs.package.env.RELEASE_SHA).toBe("${{ inputs.source-sha }}")
})
