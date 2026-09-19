import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createCaptureRunner } from "../src/adapters/playwright/runner.js"
import { createCaptureStore } from "../src/adapters/storage/captures.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { Environment } from "../src/core/types/environment.js"
import type { CaptureRun } from "../src/core/types/playwright.js"

test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")(
  "Docker Chromium은 loopback 앱을 캡처하고 종료 후에도 이미지와 영상을 보존한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "capture-docker-")),
      ownerId = randomUUID(),
      id = randomUUID(),
      environmentId = randomUUID()
    const docker = async (args: string[]) =>
      (await execa("docker", args, { timeout: 60000 })).stdout.trim()
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
    const runner = createCaptureRunner(join(root, "runtime"), ownerId)
    try {
      await mkdir(join(root, "ui-tests"))
      await writeFile(
        join(root, "ui-tests", "page.spec.ts"),
        `import {test,expect} from '@playwright/test';
        test('실제 브라우저의 체크포인트',async({page,browser},info)=>{
          expect(process.env.REDPACT_UI_LANGUAGE).toBe('ko');
          await test.step('페이지 열기',async()=>{await page.goto('/');await expect(page.getByRole('heading')).toHaveText('한국어 화면')});
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
          const second=await context.newPage();await second.goto('http://127.0.0.1:3000/');
          await info.attach('고해상도',{body:await second.screenshot(),contentType:'image/png'});
          await context.close();
        })`,
      )
      target = await docker([
        "run",
        "-d",
        "--label",
        `io.redpact.owner=${ownerId}`,
        "--label",
        `io.redpact.environment=${environmentId}`,
        "node:24-bookworm-slim",
        "node",
        "-e",
        `require('http').createServer((q,s)=>{s.setHeader('Content-Type','text/html; charset=utf-8');s.end('<h1>한국어 화면</h1>')}).listen(3000,'127.0.0.1')`,
      ])
      const runtimeId = await docker(["info", "--format", "{{.ID}}"])
      run.sourceDigest = await runner.captureSources(id, root, settings)
      const env = {
        id: environmentId,
        ownerId,
        runtimeId,
        resources: [{ kind: "container", id: target, service: "app" }],
      } as Environment
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
      expect(result.outcome).toBe("passed")
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
        expect.arrayContaining(["image/png", "video/webm", "application/zip"]),
      )
      await runner.stop(run, "after")
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
      await runner.stop(run, "after")
      if (target) {
        await docker(["rm", "-fv", target])
      }
      await rm(root, { recursive: true, force: true })
    }
  },
  120000,
)
