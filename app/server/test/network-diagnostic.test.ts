import { expect, test } from "vitest"
import { networkDiagnostic } from "../src/adapters/environment/network-diagnostic.js"

test("주소 풀 소진은 소유 자원 정리와 호스트 주소 설정을 구분해 안내한다", () => {
  const message = "all predefined address pools have been fully subnetted"
  expect(networkDiagnostic(message)).toContain("default-address-pools")
  expect(networkDiagnostic(message)).toContain("retry Stop")
  expect(networkDiagnostic(message)).toContain(message)
})
test("주소 대역 충돌은 풀 소진과 구분하고 다른 오류는 그대로 보존한다", () => {
  expect(networkDiagnostic("Pool overlaps with other one on this address space")).toContain(
    "overlapping subnet",
  )
  expect(networkDiagnostic("connection refused")).toBe("connection refused")
})
