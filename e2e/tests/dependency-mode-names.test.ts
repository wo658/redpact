import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc, target } from "./target"

const execute = promisify(execFile)

test("네 dependency mode의 실행 범위와 한국어 표시를 실제 앱에서 확인한다", async (context) => {
  const step = createSteps(context)
  const root = await step("네 모드를 가진 설정을 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/dependency-four-modes-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/compose.yaml',JSON.stringify({services:{app:{image:'alpine:3.21'},db:{image:'postgres:17'}}}));
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({
      composeFiles:['compose.yaml'],applicationServices:{web:{services:['app']}},
      dependencies:{database:{modes:{
        isolated:{services:['db'],env:{app:{DB_URL:'postgres://db:5432/review'}}},
        'shared-local':{env:{app:{DB_URL:'postgres://host.docker.internal:5432/review'}}},
        remote:{env:{app:{DB_URL:'postgres://database.example.test:5432/review'}}},
        mock:{env:{app:{DB_MODE:'mock'}}}
      }}}
    }));console.log(JSON.stringify(root));
  `),
  )
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  await step("MCP는 환경별 서비스만 추가하고 연결 모드의 값을 보존한다", async () => {
    for (const mode of ["isolated", "shared-local", "remote", "mock"]) {
      const result = await rpc<{
        structuredContent: {
          validation: { valid: boolean }
          plan: { activeServices: string[]; bindings: unknown }
        }
      }>("tools/call", {
        name: "configure",
        arguments: {
          action: "validate",
          path: root,
          selection: { services: ["app"], select: { database: mode } },
        },
      })
      expect(result.structuredContent.validation.valid).toBe(true)
      expect(result.structuredContent.plan.activeServices).toEqual(
        mode === "isolated" ? ["app", "db"] : ["app"],
      )
      if (mode === "shared-local") {
        expect(result.structuredContent.plan.bindings).toEqual({
          app: { DB_URL: { value: "postgres://host.docker.internal:5432/review" } },
        })
      }
    }
  })
  await step("HTTP는 연결 모드의 서비스 생성과 이전 식별자를 거부한다", async () => {
    const endpoint = `/api/projects/${project.body.id}/configuration`
    const current = await http<{ source: string; revision: string }>(endpoint)
    for (const mode of ["shared-local", "remote", "self-hosted", "external"]) {
      const settings = JSON.parse(current.body.source)
      settings.dependencies.database.modes[mode] = { services: ["db"] }
      expect(
        (
          await http(endpoint, "PUT", {
            source: JSON.stringify(settings),
            revision: current.body.revision,
          })
        ).status,
      ).toBe(400)
    }
    expect((await http<{ source: string }>(endpoint)).body.source).toBe(current.body.source)
  })
  await step("데스크톱과 모바일에서 네 표시명과 모드별 편집을 확인한다", async () => {
    const source = `
      const {test,expect}=require('@playwright/test');
      test('네 모드의 표시와 전환',async({page})=>{
        await page.addInitScript(id=>{localStorage.setItem('redpact:language','ko');localStorage.setItem('redpact:project',id)},${JSON.stringify(project.body.id)});
        await page.goto('http://127.0.0.1:54318/');
        await page.getByRole('button',{name:'Dependencies',exact:true}).click();
        await page.getByRole('tab',{name:'설정',exact:true}).click();
        for(const width of [1440,390]) {
          await page.setViewportSize({width,height:900});
          for(const [label,value] of [['환경별 실행','postgres://db:5432/review'],['로컬 공용','postgres://host.docker.internal:5432/review'],['원격 연결','postgres://database.example.test:5432/review'],['모의 실행','mock']]) {
            const tab=page.getByRole('tab',{name:label,exact:true});
            await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');
            await expect(page.getByText(value,{exact:true})).toBeVisible();
          }
        }
        await page.getByRole('tab',{name:'로컬 공용',exact:true}).click();
        await page.getByRole('button',{name:'DB_URL 수정',exact:true}).click();
        await page.getByRole('textbox',{name:'value',exact:true}).fill('postgres://host.docker.internal:5433/review');
        await page.getByRole('button',{name:'저장',exact:true}).click();
        await expect(page.getByText('postgres://host.docker.internal:5433/review',{exact:true})).toBeVisible();
        await page.setViewportSize({width:1440,height:900});
        await page.reload();
        await page.getByRole('button',{name:'Dependencies',exact:true}).click();
        await page.getByRole('tab',{name:'설정',exact:true}).click();
        await page.getByRole('tab',{name:'로컬 공용',exact:true}).click();
        await expect(page.getByText('postgres://host.docker.internal:5433/review',{exact:true})).toBeVisible();
      });`
    const result = await execute(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        `container:${await target()}`,
        "--entrypoint",
        "node",
        "redpact-playwright:1.63.0-v1",
        "-e",
        `const fs=require('fs'),{execFileSync}=require('child_process');fs.writeFileSync('/review/tests/modes.spec.cjs',process.argv[1]);fs.writeFileSync('/review/modes.config.cjs',"module.exports={testDir:'/review/tests',testMatch:'modes.spec.cjs',reporter:'json',use:{headless:true},workers:1}");try{process.stdout.write(execFileSync('/review/node_modules/.bin/playwright',['test','--config','/review/modes.config.cjs'],{encoding:'utf8'}))}catch(e){process.stdout.write(e.stdout||'');process.exitCode=1}`,
        source,
      ],
      { timeout: 45000, maxBuffer: 2 * 1024 * 1024 },
    ).catch((error) => {
      if (error.stdout) {
        return { stdout: String(error.stdout) }
      }
      throw error
    })
    const report = JSON.parse(result.stdout)
    expect(report.stats.unexpected, JSON.stringify(report.suites)).toBe(0)
    expect(report.stats.expected).toBe(1)
  })
})
