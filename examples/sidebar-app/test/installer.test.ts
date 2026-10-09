import { expect, test, vi } from "vitest"
import { createInstallJob } from "../src/redpact/install-job.js"

test("설치가 없을 때 읽기는 설치하지 않고 명시적인 요청만 한 번 설치한다", async () => {
  const perform = vi.fn(async () => {})
  const job = createInstallJob(perform)
  expect(job.status().state).toBe("idle")
  expect(perform).not.toHaveBeenCalled()
  await Promise.all([job.start("npm"), job.start("pnpm")])
  await job.wait()
  expect(perform).toHaveBeenCalledTimes(1)
  expect(perform).toHaveBeenCalledWith("npm")
})

test("설치 실패를 표시하고 다음 요청으로 재시도할 수 있다", async () => {
  let attempts = 0
  const job = createInstallJob(async () => {
    attempts++
    if (attempts === 1) {
      throw new Error("Registry unavailable")
    }
  })
  await job.start("pnpm")
  await job.wait()
  expect(job.status()).toMatchObject({ state: "failed", error: "Registry unavailable" })
  await job.start("pnpm")
  await job.wait()
  expect(job.status().state).toBe("idle")
})

test("부모 pnpm 실행의 저장소 설정을 새 설치에 전달하지 않는다", async () => {
  const { installationEnvironment } = await import("../src/redpact/installer.js")
  const env = installationEnvironment({
    PATH: "/usr/bin",
    npm_config_store_dir: "/other-store",
    npm_config_node_linker: "isolated",
    PNPM_SCRIPT_SRC_DIR: "/other-project",
    HTTPS_PROXY: "http://proxy.invalid",
  })
  expect(env.npm_config_store_dir).toBeUndefined()
  expect(env.PNPM_SCRIPT_SRC_DIR).toBeUndefined()
  expect(env.HTTPS_PROXY).toBe("http://proxy.invalid")
})
