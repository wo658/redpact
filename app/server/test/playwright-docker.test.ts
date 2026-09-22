import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { GenericContainer, Wait } from "testcontainers"
import { expect, test } from "vitest"
import { createCaptureRunner } from "../src/adapters/playwright/runner.js"
import { createCaptureStore } from "../src/adapters/storage/captures.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { Environment } from "../src/core/types/environment.js"
import type { CaptureRun } from "../src/core/types/playwright.js"

test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")(
  "Docker Chromium은 별도 네트워크 공간의 앱을 캡처하고 종료 후에도 이미지와 영상을 보존한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "capture-docker-")),
      ownerId = randomUUID(),
      id = randomUUID(),
      environmentId = randomUUID()
    const docker = async (args: string[]) =>
      (await execa("docker", args, { timeout: 60000 })).stdout.trim()
    const projectName = `redpact-${environmentId}`
    const network = `${projectName}_redpact-runner`
    await docker(["network", "create", network])
    const shared = createServer((_q, response) => response.end("shared-local"))
    await new Promise<void>((resolve) => shared.listen(0, "127.0.0.1", resolve))
    const address = shared.address()
    if (!address || typeof address === "string") {
      throw new Error("No shared listener")
    }
    await execa(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(root, "key.pem"),
        "-out",
        join(root, "cert.pem"),
        "-days",
        "1",
        "-subj",
        "/CN=external.test",
      ],
      { timeout: 30000 },
    )
    const external = await new GenericContainer("node:24-bookworm-slim")
      .withExposedPorts(3000, 3443)
      .withCopyContentToContainer([
        { content: await readFile(join(root, "key.pem")), target: "/key.pem" },
        { content: await readFile(join(root, "cert.pem")), target: "/cert.pem" },
      ])
      .withCommand([
        "node",
        "-e",
        `const fs=require('fs');const handler=(q,s)=>{s.statusCode=q.headers.authorization==='Bearer runner-secret'?200:401;s.end('external')};require('http').createServer(handler).listen(3000,'0.0.0.0');require('https').createServer({key:fs.readFileSync('/key.pem'),cert:fs.readFileSync('/cert.pem')},handler).listen(3443,'0.0.0.0',()=>console.log('ready'))`,
      ])
      .withWaitStrategy(Wait.forLogMessage("ready"))
      .start()
    let target = ""
    const settings = settingsSchema.parse({
      playwright: {
        targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
        service: "app",
        port: 3000,
        uiLanguage: "ko",
        video: true,
      },
    }).playwright!
    const run: CaptureRun = {
      version: 1,
      target: "captures",
      purpose: "capture",
      id,
      worktreeId: "w",
      projectId: "p",
      projectRoot: root,
      revision: null,
      settings,
      selection: { services: ["app"], select: {} },
      settingsDigest: "settings",
      sourceDigest: "",
      appDigest: "",
      createdAt: new Date().toISOString(),
      state: "running",
      before: { state: "unavailable", cases: [] },
      after: { state: "running", cases: [] },
    }
    const runner = createCaptureRunner(
      join(root, "runtime"),
      ownerId,
      () => ["runner-secret"],
      undefined,
      () => ({ remoteToken: "runner-secret" }),
    )
    try {
      await mkdir(join(root, "ui-tests"))
      await writeFile(
        join(root, "ui-tests", "page.spec.ts"),
        `import {test,expect} from '@playwright/test';
        test('실제 브라우저의 체크포인트',async({page,browser,request},info)=>{
          expect(process.env.REDPACT_UI_LANGUAGE).toBe('ko');
          expect(process.env.SHARED_INPUT).toBe('common');
          expect(process.env.REDPACT_TOKEN).toBeUndefined();
          expect(require('fs').existsSync('/var/run/docker.sock')).toBe(false);
          expect(await (await request.get(process.env.MOCK_URL)).text()).toContain('한국어 화면');
          const remote=await request.get(process.env.REMOTE_URL,{headers:{authorization:'Bearer '+process.env.REMOTE_TOKEN}});
          expect(remote.status()).toBe(200);expect(await remote.text()).toBe('external');
          expect(process.env.APP_URL).toBe('http://app.redpact.test:3000');
          expect(await (await request.get(process.env.SHARED_URL)).text()).toBe('shared-local');
          expect(JSON.parse(require('fs').readFileSync(process.env.REDPACT_CONNECTIONS_FILE,'utf8')).services.app.ports['3000']).toEqual({host:'app.redpact.test',port:3000});
          await test.step('페이지 열기',async()=>{await page.goto('/');await expect(page.getByRole('heading')).toHaveText('한국어 화면')});
          await test.step('브라우저의 쿠키와 CORS 및 TLS 정책을 유지한다', async()=>{
            expect((await page.context().cookies()).find(c=>c.name==='session')).toMatchObject({domain:'app.redpact.test',httpOnly:true,sameSite:'Lax'});
            expect(await page.evaluate(async(url)=>{try{await fetch(url);return 'allowed'}catch{return 'blocked'}},process.env.REMOTE_URL)).toBe('blocked');
            const tls=await page.context().newPage();
            await expect(tls.goto(process.env.TLS_URL)).rejects.toThrow(/ERR_CERT_AUTHORITY_INVALID/);
            await tls.close();
          });
          await page.evaluate(()=>document.fonts.ready);
          await info.attach('화면',{body:await page.screenshot(),contentType:'image/png'});
          await page.setViewportSize({width:414,height:896});
          const mobile=await page.screenshot({fullPage:true});
          await info.attach('부분',{body:await page.getByRole('heading').screenshot(),contentType:'image/png'});
          await page.setViewportSize({width:768,height:900});
          await info.attach('모바일',{body:mobile,contentType:'image/png'});
          const path=info.outputPath('boundary.png');
          await page.screenshot({path});await info.attach('경계',{path,contentType:'image/png'});
          const context=await browser.newContext({viewport:{width:414,height:896},deviceScaleFactor:2});
          const second=await context.newPage();await second.goto('http://app.redpact.test:3000/');
          await info.attach('고해상도',{body:await second.screenshot(),contentType:'image/png'});
          await context.close();
        })`,
      )
      target = await docker([
        "run",
        "-d",
        "--network",
        network,
        "--network-alias",
        "app.redpact.test",
        "--network-alias",
        "mock.redpact.test",
        "--label",
        `io.redpact.owner=${ownerId}`,
        "--label",
        `io.redpact.environment=${environmentId}`,
        "node:24-bookworm-slim",
        "node",
        "-e",
        `require('http').createServer((q,s)=>{s.setHeader('Content-Type','text/html; charset=utf-8');s.setHeader('Set-Cookie','session=example; HttpOnly; SameSite=Lax; Path=/');s.end('<h1>한국어 화면</h1>')}).listen(3000,'0.0.0.0')`,
      ])
      const runtimeId = await docker(["info", "--format", "{{.ID}}"])
      run.sourceDigest = await runner.captureSources(id, root, settings)
      const env = {
        id: environmentId,
        ownerId,
        runtimeId,
        projectName,
        settings: {
          tests: {
            timeoutMs: 10000,
            env: {
              SHARED_INPUT: { value: "common" },
              MOCK_URL: { value: "http://mock.redpact.test:3000" },
              REMOTE_URL: { value: `http://host.docker.internal:${external.getMappedPort(3000)}` },
              TLS_URL: { value: `https://host.docker.internal:${external.getMappedPort(3443)}` },
              REMOTE_TOKEN: { secret: "remoteToken" },
              SHARED_URL: { value: `http://host.docker.internal:${address.port}` },
              APP_URL: { service: "app", port: 3000, scheme: "http", value: "url" },
            },
          },
          environment: {
            compose: { files: [], profiles: [] },
            variables: {},
            timeoutMs: 120000,
            stopTimeoutMs: 30000,
          },
        },
        plan: { activeServices: ["app"] },
        endpoints: { "app:3000": { host: "127.0.0.1", port: 12345 } },
        resources: [{ kind: "container", id: target, service: "app" }],
      } as unknown as Environment
      const result = await runner.execute(
        run,
        "after",
        env,
        new AbortController().signal,
        (patch) => Object.assign(run.after, patch),
      )
      Object.assign(run.after, result, { state: "finished" })
      run.state = "finished"
      run.outcome = "passed"
      expect(result.outcome, JSON.stringify(result)).toBe("passed")
      expect(result.cases[0].artifacts.find((a) => a.name === "모바일")).toMatchObject({
        viewport: { width: 414, height: 896 },
      })
      expect(result.cases[0].artifacts.find((a) => a.name === "부분")).toMatchObject({
        viewport: { width: 414, height: 896 },
      })
      expect(result.cases[0].artifacts.find((a) => a.name === "경계")).toMatchObject({
        viewport: { width: 768, height: 900 },
      })
      expect(result.cases[0].steps[0].title).toBe("페이지 열기")
      const artifacts = result.cases[0].artifacts
      expect(artifacts.map((a) => a.contentType)).toEqual(
        expect.arrayContaining(["image/png", "video/webm"]),
      )
      // 자격 증명이 있는 실행에서는 trace를 수집하지 않는 기존 정책을 유지한다.
      expect(artifacts.some((artifact) => artifact.contentType === "application/zip")).toBe(false)
      await runner.stop(run, "after")
      expect(
        (
          await execa("docker", ["ps", "-aq", "--filter", `label=io.redpact.capture=${id}`])
        ).stdout.trim(),
      ).toBe("")
      expect(
        (
          await fetch(`http://${external.getHost()}:${external.getMappedPort(3000)}`, {
            headers: { authorization: "Bearer runner-secret" },
          })
        ).ok,
      ).toBe(true)
      await docker(["rm", "-fv", target])
      target = ""
      const store = createCaptureStore(join(root, "runtime"))
      store.save(run)
      const image = artifacts.find((a) => a.name === "화면")!
      const highResolution = artifacts.find((a) => a.name === "고해상도")!
      expect(highResolution.viewport).toEqual({ width: 414, height: 896 })
      const highResolutionBytes = Buffer.from(
        (await store.artifact(run, "after", highResolution.id)).data,
      )
      expect(highResolutionBytes.readUInt32BE(16)).toBe(828)
      const bytes = (await store.artifact(run, "after", image.id)).data
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    } finally {
      await new Promise<void>((resolve, reject) =>
        shared.close((error) => (error ? reject(error) : resolve())),
      )
      await runner.stop(run, "after")
      await external.stop()
      if (target) {
        await docker(["rm", "-fv", target])
      }
      await docker(["network", "rm", network])
      await rm(root, { recursive: true, force: true })
    }
  },
  120000,
)
