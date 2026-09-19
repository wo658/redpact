import { expect, test } from "vitest"

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
const input = { version: "0.1.0", tag: "desktop-v0.1.0", config, privateKey: "secret" }

test("릴리스 버전과 공개 키를 native updater 빌드에 전달하고 비공개 키는 반환하지 않는다", () => {
  expect(releaseEnvironment(input)).toEqual({
    REDPACT_UPDATE_ENDPOINT: config.plugins.updater.endpoints[0],
    REDPACT_UPDATE_PUBLIC_KEY: publicKey,
  })
})
test("다른 버전이나 prerelease 태그는 stable feed에 배포하지 않는다", () => {
  for (const tag of ["desktop-v0.2.0", "v0.1.0", "desktop-v0.1.0-beta.1"]) {
    expect(() => releaseEnvironment({ ...input, tag })).toThrow("tag")
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
