import { expect, test } from "vitest"
import { createSteps } from "./steps.js"
import { http, node } from "./target.js"

test("플러그인 조회와 CLI 경로 저장은 실제 HTTP 경계에서 동작한다", async (context) => {
  const step = createSteps(context)
  await step("초기 조회는 CLI 실행 없이 확인 전 상태를 반환한다", async () => {
    const response = await http("/api/plugin-updates")
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ busy: false })
  })
  const original = await step("현재 인스턴스 설정을 읽는다", () =>
    http<{ source: string; revision: string }>("/api/instance/settings"),
  )
  try {
    await step("존재하지 않는 CLI 경로도 저장하되 실행 성공으로 간주하지 않는다", async () => {
      const value = JSON.parse(original.body.source)
      value.agents = {
        codex: { cliPath: "/missing/codex" },
        claude: { cliPath: "/missing/claude" },
      }
      const saved = await http("/api/instance/settings", "PUT", {
        source: JSON.stringify(value),
        revision: original.body.revision,
      })
      expect(saved.status).toBe(200)
      expect(saved.body.value).toMatchObject({ agents: value.agents })
    })
    await step("CLI 실행 오류를 최신 또는 미설치로 표시하지 않는다", async () => {
      const checked = await http<{ agents: { status: string; error: string }[] }>(
        "/api/plugin-updates/check",
        "POST",
      )
      expect(checked.status).toBe(200)
      expect(checked.body.agents).toHaveLength(2)
      for (const agent of checked.body.agents) {
        expect(agent.status).toBe("error")
        expect(agent.error).toBeTruthy()
      }
    })
    await step("확인되지 않은 버전의 설치는 거부한다", async () => {
      expect(
        (await http("/api/plugin-updates/install", "POST", { agent: "codex", version: "9.0.0" }))
          .status,
      ).toBe(409)
    })
  } finally {
    const current = await http<{ revision: string }>("/api/instance/settings")
    await http("/api/instance/settings", "PUT", {
      source: original.body.source,
      revision: current.body.revision,
    })
  }
})

// 실제 에이전트 설치를 변경하지 않도록 외부 CLI만 격리된 실행 파일로 대체한다.
test("실제 앱은 확인한 플러그인을 CLI로 갱신하고 설치 버전을 다시 검증한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("개인 마켓플레이스와 격리된 에이전트 CLI를 준비한다", () =>
    node<{ root: string; cli: string; version: string }>(`
    const fs = await import('node:fs/promises'); const os = await import('node:os'); const path = await import('node:path');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'redpact-plugin-e2e-'));
    const manifest = {name:'redpact',version:'0.1.0+codex.20260927112208'};
    await fs.mkdir(path.join(root,'.agents/plugins'),{recursive:true});
    await fs.writeFile(path.join(root,'.agents/plugins/marketplace.json'),JSON.stringify({plugins:[{name:'redpact',source:{source:'local',path:'./plugins/redpact'}}]}));
    await fs.mkdir(path.join(root, 'plugins/redpact/.codex-plugin'), {recursive:true});
    await fs.writeFile(path.join(root, 'plugins/redpact/.codex-plugin/plugin.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(root, 'version'), '0.1.0+codex.20260919112208');
    const cli = path.join(root, 'codex');
    const script = [
      '#!/usr/bin/env node',
      "const fs = require('node:fs'); const path = require('node:path'); const root = __dirname; const args = process.argv.slice(2);",
      "fs.appendFileSync(path.join(root, 'calls'), JSON.stringify(args) + String.fromCharCode(10));",
      "let result = {};",
      "if (args[1] === 'list') result = {installed:[{pluginId:'redpact@personal', marketplaceName:'personal', version:fs.readFileSync(path.join(root,'version'),'utf8'), installed:true, enabled:true}]};",
      "if (args[2] === 'list') result = {marketplaces:[{name:'personal',root,marketplaceSource:{sourceType:'git',source:'https://example.test/team.git'}}]};",
      "if (args[1] === 'add') fs.writeFileSync(path.join(root,'version'), JSON.parse(fs.readFileSync(path.join(root,'plugins/redpact/.codex-plugin/plugin.json'),'utf8')).version);",
      "console.log(JSON.stringify(result));"
    ].join(String.fromCharCode(10));
    await fs.writeFile(cli, script, {mode:0o700});
    console.log(JSON.stringify({root, cli, version:manifest.version}));
  `),
  )
  const original = await http<{ source: string; revision: string }>("/api/instance/settings")
  try {
    await step("격리 CLI 경로를 저장하고 최신 버전을 확인한다", async () => {
      const value = JSON.parse(original.body.source)
      value.agents = { codex: { cliPath: fixture.cli }, claude: { cliPath: "/missing/claude" } }
      expect(
        (
          await http("/api/instance/settings", "PUT", {
            source: JSON.stringify(value),
            revision: original.body.revision,
          })
        ).status,
      ).toBe(200)
      const result = await http<{
        agents: { agent: string; status: string; latestVersion: string }[]
      }>("/api/plugin-updates/check", "POST")
      expect(result.body.agents.find((row) => row.agent === "codex")).toMatchObject({
        status: "available",
        latestVersion: fixture.version,
      })
    })
    await step("설치 요청이 CLI를 호출하고 새 설치 버전을 반환한다", async () => {
      const result = await http<{
        agents: { agent: string; status: string; currentVersion: string }[]
      }>("/api/plugin-updates/install", "POST", { agent: "codex", version: fixture.version })
      expect(result.status).toBe(200)
      expect(result.body.agents.find((row) => row.agent === "codex")).toMatchObject({
        status: "updated",
        currentVersion: fixture.version,
      })
    })
    await step("대상 마켓플레이스만 갱신하고 중복 설치를 거부한다", async () => {
      const calls = await node<string[][]>(
        `const fs=await import('node:fs');const root=JSON.parse(process.argv[1]);console.log(JSON.stringify(fs.readFileSync(root+'/calls','utf8').trim().split(String.fromCharCode(10)).map(JSON.parse)));`,
        fixture.root,
      )
      expect(calls).toContainEqual(["plugin", "marketplace", "upgrade", "personal"])
      expect(calls.filter((args) => args[1] === "add")).toEqual([
        ["plugin", "add", "redpact@personal", "--json"],
      ])
      expect(
        (
          await http("/api/plugin-updates/install", "POST", {
            agent: "codex",
            version: fixture.version,
          })
        ).status,
      ).toBe(409)
    })
  } finally {
    const current = await http<{ revision: string }>("/api/instance/settings")
    await http("/api/instance/settings", "PUT", {
      source: original.body.source,
      revision: current.body.revision,
    })
    await node(
      `(await import('node:fs')).rmSync(JSON.parse(process.argv[1]),{recursive:true,force:true});console.log('null');`,
      fixture.root,
    )
  }
})
