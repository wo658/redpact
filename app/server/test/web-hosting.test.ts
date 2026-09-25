import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { parse } from "yaml"

const root = fileURLToPath(new URL("../../../", import.meta.url))

describe("Compose 웹 호스팅", () => {
  test("독립적인 웹 호스팅 구성을 제공한다", () => {
    expect(existsSync(`${root}compose.yaml`)).toBe(true)
    expect(existsSync(`${root}Dockerfile`)).toBe(true)
  })

  test("루프백 포트와 영속 데이터를 사용하고 호스트 권한은 자동 공유하지 않는다", () => {
    const compose = parse(readFileSync(`${root}compose.yaml`, "utf8"))
    const service = compose.services.redpact
    expect(service.ports).toEqual([`127.0.0.1:\${REDPACT_WEB_PORT:-54318}:54318`])
    expect(service.volumes).toContain("redpact-data:/data")
    expect(JSON.stringify(service)).not.toContain("docker.sock")
    expect(service.privileged).not.toBe(true)
    expect(service.healthcheck.test.join(" ")).toContain("/api/health")
  })
})
