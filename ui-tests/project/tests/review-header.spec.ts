import { expect, test } from "@playwright/test"
import { node } from "../target"

// 격리된 테스트 앱에서 새 탭의 Web Crypto API를 사용한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("UI 리뷰 액션이 나타나도 헤더 높이와 좌우 배치를 유지한다", async ({ page }) => {
  const project = await node<{ id: string; name: string; settingsSource: string }>(`
            import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
            import {randomUUID} from 'node:crypto';
            const origin='http://127.0.0.1:54318';
            const project=await (await fetch(origin+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'/app',name:'Redpact'})})).json();
            const worktrees=await (await fetch(origin+'/api/projects/'+project.id+'/worktrees')).json();
            const worktree=worktrees.find(item=>item.projectRoot==='/app');
            if(!worktree) throw new Error('Header fixture worktree missing');
            const settingsPath='/app/.redpact/settings.json';
            const settingsSource=readFileSync(settingsPath,'utf8');
            const settings=JSON.parse(settingsSource);
            settings.playwright={...settings.playwright,directory:'ui-tests',service:'app',port:54320,
              targets:{...settings.playwright?.targets,'header-capture':{scope:'worktree',purpose:'capture',testMatch:['worktree/captures/header.spec.ts']}}};
            writeFileSync(settingsPath,JSON.stringify(settings));
            mkdirSync('/app/ui-tests/worktree/captures',{recursive:true});
            writeFileSync('/app/ui-tests/worktree/captures/header.spec.ts',"import {test} from '@playwright/test'; test('헤더 캡처', async()=>{});");
            const id=randomUUID();
            const directory='/tmp/redpact-e2e-state/playwright-runs';
            mkdirSync(directory,{recursive:true});
            writeFileSync(directory+'/'+id+'.json',JSON.stringify({version:1,id,target:'captures',purpose:'capture',scope:'worktree',worktreeId:worktree.id,projectId:project.id,projectRoot:'/app',revision:null,settings:{directory:'ui-tests',targets:{captures:{purpose:'capture',testMatch:['project/captures/**/*.spec.ts']}},service:'app',port:54318,viewport:{width:1920,height:1080}},selection:{services:['app'],select:{}},settingsDigest:'header-fixture',sourceDigest:'header-fixture',appDigest:'header-fixture',createdAt:new Date().toISOString(),state:'finished',outcome:'failed',cleanupError:'Retained header recovery fixture',before:{state:'unavailable',cases:[]},after:{state:'finished',outcome:'failed',cases:[]}}));

            console.log(JSON.stringify({...project,settingsSource}));
  `)
  try {
    expect(project, "리뷰할 프로젝트가 있어야 한다").toBeTruthy()
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:language", "en")
      localStorage.setItem("redpact:project", id)
    }, project.id)
    await page.goto("/")
    const workspaceTabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
    await expect(workspaceTabs.getByRole("tab")).toHaveCount(1)
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    await page.getByRole("button", { name: "New tab", exact: true }).click()
    const worktree = page
      .getByRole("navigation", { name: "Worktrees", exact: true })
      .getByRole("button")
      .first()
    const worktreeName = await worktree.getAttribute("aria-label")
    expect(worktreeName, "워크트리 이름이 접근성 레이블로 제공되어야 한다").toBeTruthy()
    await worktree.click()
    await expect(
      workspaceTabs.getByRole("tab", {
        name: `${project.name} / Worktrees`,
        exact: true,
      }),
    ).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole("button", { name: "Toggle Sidebar", exact: true })).toBeVisible()
    const projectTab = workspaceTabs.getByRole("tab").first()
    const worktreeTab = workspaceTabs.getByRole("tab", {
      name: `${project.name} / Worktrees`,
      exact: true,
    })
    const projectTabWidth = await projectTab.evaluate(
      (element) => element.parentElement?.clientWidth,
    )
    const worktreeTabWidth = await worktreeTab.evaluate(
      (element) => element.parentElement?.clientWidth,
    )
    expect(projectTabWidth, "헤더 작업 탭은 레이블 길이와 관계없이 같은 폭을 쓴다").toBe(
      worktreeTabWidth,
    )
    const toolbar = page.locator('[data-slot="review-toolbar"]')
    for (const width of [1440, 850, 390]) {
      await test.step(`${width}px에서 탭 전환과 Mobile 토글을 확인한다`, async () => {
        await page.setViewportSize({ width, height: 900 })
        if (width < 768) {
          await expect(
            page.getByRole("button", { name: "Toggle Sidebar", exact: true }),
          ).toBeVisible()
        }
        await page.getByRole("tab", { name: "Log", exact: true }).click()
        const before = await toolbar.boundingBox()
        const fontSize = await page
          .getByRole("tab", { name: "Log", exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize)
        await page.getByRole("tab", { name: "Playwright", exact: true }).click()
        const mobile = page.getByRole("switch", { name: "Mobile", exact: true })
        await expect(mobile).toBeVisible()
        const after = await toolbar.boundingBox()
        if (!before || !after) {
          throw new Error("헤더가 표시되어야 한다")
        }
        expect(after.height, "헤더가 한 줄 높이를 유지한다").toBeLessThanOrEqual(54)
        expect(
          Math.abs(after.height - before.height),
          "추가 액션으로 헤더가 높아지지 않는다",
        ).toBeLessThanOrEqual(1)
        const navigation = await toolbar.locator('[data-slot="toolbar-navigation"]').boundingBox()
        const actions = await toolbar.locator('[data-slot="toolbar-actions"]').boundingBox()
        if (!navigation || !actions) {
          throw new Error("탐색과 액션이 표시되어야 한다")
        }
        expect(actions.x, "액션이 탐색 탭 오른쪽에 놓인다").toBeGreaterThan(navigation.x)
        expect(Math.abs(actions.y - navigation.y)).toBeLessThanOrEqual(4)
        expect(
          await page
            .getByRole("tab", { name: "Log", exact: true })
            .evaluate((element) => getComputedStyle(element).fontSize),
        ).toBe(fontSize)
        const checked = await mobile.getAttribute("aria-checked")
        await mobile.click()
        await expect(mobile).toHaveAttribute("aria-checked", checked === "true" ? "false" : "true")
        const run = page.getByRole("button", { name: "Run Playwright", exact: true })
        await run.scrollIntoViewIfNeeded()
        await expect(run).toBeInViewport()
        expect(await run.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap")
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
      })
    }
    const closingLabel = await workspaceTabs
      .getByRole("tab", { selected: true })
      .getAttribute("aria-label")
    await workspaceTabs.getByRole("button", { name: `Close ${closingLabel}`, exact: true }).click()
    await expect(
      workspaceTabs.getByRole("tab", {
        name: `${project.name} / Worktrees`,
        exact: true,
      }),
    ).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(worktree).toBeVisible()
  } finally {
    await node(
      `
      import {writeFileSync,rmSync} from 'node:fs';
      writeFileSync('/app/.redpact/settings.json',JSON.parse(process.argv[1]));
      rmSync('/app/ui-tests/worktree/captures/header.spec.ts',{force:true});
      console.log('null');
    `,
      project.settingsSource,
    )
  }
})
