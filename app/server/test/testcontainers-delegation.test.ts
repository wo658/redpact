import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Readable } from "node:stream"
import { afterEach, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const library = dirname(require.resolve("testcontainers"))
const { DockerImageClient } = require(
  join(library, "container-runtime/clients/image/docker-image-client.js"),
)
const { waitForContainer } = require(join(library, "wait-strategies/wait-for-container.js"))
const { DockerContainerClient } = require(
  join(library, "container-runtime/clients/container/docker-container-client.js"),
)
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test("빌드 스트림 오류는 이전 이미지 태그가 있어도 실패한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-build-regression-"))
  directories.push(root)
  await writeFile(join(root, "Dockerfile"), "FROM scratch\n")
  let contextClosed = false
  const Dockerode = createRequire(join(library, "index.js"))("dockerode")
  const docker = {
    modem: new Dockerode().modem,
    buildImage: vi.fn(async (tar: Readable) => {
      tar.once("close", () => {
        contextClosed = true
      })
      tar.resume()
      return Readable.from([
        Buffer.from(
          '{"errorDetail":{"message":"RUN exit 17 failed"},"error":"RUN exit 17 failed"}\n',
        ),
      ])
    }),
  }
  const client = new DockerImageClient(docker, "https://index.docker.io/v1/")
  await expect(client.build(root, { t: "previous-image:exists" })).rejects.toThrow(
    "RUN exit 17 failed",
  )
  expect(contextClosed).toBe(true)
})

test("자동 정리를 끈 대기 실패는 로그 수집 전 컨테이너를 삭제하지 않는다", async () => {
  const stop = vi.fn(),
    remove = vi.fn()
  const wait = { waitUntilReady: vi.fn().mockRejectedValue(new Error("unhealthy")) }
  await expect(
    waitForContainer(
      { container: { stop, remove } },
      { id: "evidence" },
      wait,
      {},
      undefined,
      false,
    ),
  ).rejects.toThrow("unhealthy")
  expect(stop).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})

test("유한 로그 조회 실패를 호출자에게 전파한다", async () => {
  const client = new DockerContainerClient({})
  const container = { id: "missing", logs: vi.fn().mockRejectedValue(new Error("log unavailable")) }
  await expect(client.logs(container, { follow: false })).rejects.toThrow("log unavailable")
})

test("Docker 빌드 API 자체의 거부도 즉시 전파한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-build-api-"))
  directories.push(root)
  let contextClosed = false
  const client = new DockerImageClient(
    {
      buildImage: async (tar: Readable) => {
        tar.once("close", () => {
          contextClosed = true
        })
        tar.resume()
        throw new Error("daemon refused build")
      },
    },
    "https://index.docker.io/v1/",
  )
  await expect(client.build(root, { t: "unused" })).rejects.toThrow("daemon refused build")
  expect(contextClosed).toBe(true)
})

test.each(["응답 전", "응답 후"])(
  "빌드 컨텍스트 오류는 %s에도 전파하고 생산자를 닫는다",
  async (phase) => {
    const root = await mkdtemp(join(tmpdir(), "redpact-build-context-"))
    directories.push(root)
    const failure = new Error("context could not be read")
    let contextClosed = false
    const client = new DockerImageClient(
      {
        buildImage: async (tar: Readable) => {
          tar.once("close", () => {
            contextClosed = true
          })
          if (phase === "응답 전") {
            tar.destroy(failure)
            await new Promise((resolve) => setImmediate(resolve))
          } else {
            setImmediate(() => tar.destroy(failure))
          }
          return new Readable({ read() {} })
        },
      },
      "https://index.docker.io/v1/",
    )
    await expect(client.build(root, { t: "unused" })).rejects.toBe(failure)
    expect(contextClosed).toBe(true)
  },
)

test("Dockerfile별 ignore 파일이 기본 ignore보다 우선한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-build-ignore-"))
  directories.push(root)
  await writeFile(join(root, "Customfile"), "FROM scratch\n")
  await writeFile(join(root, ".dockerignore"), "keep.txt\n")
  await writeFile(join(root, "Customfile.dockerignore"), "omit.txt\n")
  await writeFile(join(root, "keep.txt"), "included")
  await writeFile(join(root, "omit.txt"), "excluded")
  const client = new DockerImageClient({}, "https://index.docker.io/v1/")
  const options = await client.createTarPackOptions(root, "Customfile")
  expect(options.entries).toContain("keep.txt")
  expect(options.entries).not.toContain("omit.txt")
})

test.each([false, true])("유한 로그에서 stdout/stderr와 TTY=%s를 보존한다", async (tty) => {
  const Dockerode = createRequire(join(library, "index.js"))("dockerode")
  const client = new DockerContainerClient({ modem: new Dockerode().modem })
  function frame(type: number, text: string) {
    const content = Buffer.from(text)
    const header = Buffer.alloc(8)
    header[0] = type
    header.writeUInt32BE(content.length, 4)
    return Buffer.concat([header, content])
  }
  const logs = vi.fn(async () =>
    tty ? Buffer.from("out\nerr\n") : Buffer.concat([frame(1, "out\n"), frame(2, "err\n")]),
  )
  const stream = await client.logs(
    { id: "logs", logs, inspect: async () => ({ Config: { Tty: tty } }) },
    { follow: false, tail: 10 },
  )
  let output = ""
  for await (const chunk of stream) {
    output += chunk.toString()
  }
  expect(output).toBe("out\nerr\n")
  expect(logs).toHaveBeenCalledWith(expect.objectContaining({ follow: false, tail: 10 }))
})

test("취소 시 종료 이벤트를 보내지 않는 exec 스트림도 반환한다", async () => {
  const stream = new Readable({ read() {} })
  stream.destroy = vi.fn(() => stream)
  const client = new DockerContainerClient({ modem: { demuxStream() {} } })
  const container = {
    id: "cancel",
    exec: async () => ({ start: async () => stream, inspect: async () => ({ ExitCode: 137 }) }),
  }
  const controller = new AbortController()
  const pending = client.exec(container, ["sleep", "60"], { signal: controller.signal })
  await new Promise((resolve) => setTimeout(resolve, 10))
  controller.abort()
  const completed = await Promise.race([
    pending.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 100)),
  ])
  expect(completed).toBe(true)
})

test("exec 전송 오류에도 상한 내 부분 출력을 보존한다", async () => {
  const Dockerode = createRequire(join(library, "index.js"))("dockerode")
  const client = new DockerContainerClient({ modem: new Dockerode().modem })
  const output = vi.fn()
  const stream = new Readable({ read() {} })
  const container = {
    id: "partial",
    exec: async () => ({ start: async () => stream, inspect: async () => ({ ExitCode: 0 }) }),
  }
  const pending = client.exec(container, ["command"], { maxOutputBytes: 4, onOutput: output })
  await new Promise((resolve) => setTimeout(resolve, 10))
  const header = Buffer.alloc(8)
  header[0] = 2
  header.writeUInt32BE(7, 4)
  stream.push(Buffer.concat([header, Buffer.from("failure")]))
  stream.destroy(new Error("connection reset"))
  await expect(pending).rejects.toThrow("connection reset")
  expect(output).toHaveBeenCalledWith({ stdout: "", stderr: "fail", truncated: true })
})
