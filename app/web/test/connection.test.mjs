import assert from "node:assert/strict"
import { createServer as createHttpServer } from "node:http"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const requests = []
const upstream = createHttpServer((req, res) => {
  requests.push({
    url: req.url,
    origin: req.headers.origin,
    authorization: req.headers.authorization,
  })
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify([{ id: "project-one", name: "Actual project" }]))
})
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
const target = `http://127.0.0.1:${upstream.address().port}`
process.env.REDPACT_API_URL = target
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } })
await server.listen()
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
const { SidebarProvider } = await server.ssrLoadModule("/src/components/ui/sidebar.tsx")
const { TooltipProvider } = await server.ssrLoadModule("/src/components/ui/tooltip.tsx")
const withSidebar = (element) =>
  createElement(
    TooltipProvider,
    null,
    createElement(SidebarProvider, { defaultOpen: false }, element),
  )
after(async () => {
  await server.close()
  await new Promise((resolve) => upstream.close(resolve))
  delete process.env.REDPACT_API_URL
})

test("entry connects automatically without a token form or demo data", async () => {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  const html = renderToStaticMarkup(createElement(App))
  assert.match(html, /Connecting to local Redpact/)
  assert.doesNotMatch(html, /type="password"|Server token/)
  assert.doesNotMatch(html, /wt-orders|checkout-api|Preview dataset/)
})

test("same-origin proxy works without credentials and normalizes the upstream origin", async () => {
  const response = await fetch(`${origin}/api/projects`, {
    headers: { Origin: origin },
  })
  assert.match(response.headers.get("content-type"), /application\/json/)
  assert.equal((await response.json())[0].id, "project-one")
  assert.deepEqual(requests.at(-1), {
    url: "/api/projects",
    origin: target,
    authorization: undefined,
  })
})

test("foreign and null origins cannot reach the API through the development proxy", async () => {
  const before = requests.length
  for (const foreign of ["https://foreign.example", "null"]) {
    const response = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: { Origin: foreign, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp" }),
    })
    assert.equal(response.status, 403)
  }
  assert.equal(requests.length, before)
})

test("proxy rejects browser fetch metadata from a different site without Origin", async () => {
  const before = requests.length
  for (const site of ["cross-site", "same-site"]) {
    const response = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": site, "Content-Type": "application/json" },
      body: "{}",
    })
    assert.equal(response.status, 403)
  }
  assert.equal(requests.length, before)
})

test("first visit puts project connection in the main content, not the sidebar", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const html = renderToStaticMarkup(createElement(ProjectManager, { api: {}, initialProjects: [] }))
  const sidebar = new JSDOM(html).window.document.querySelector('[data-slot="sidebar"]')
  assert.equal(sidebar, null)
  assert.doesNotMatch(html, /No project open/)
  assert.doesNotMatch(html, /aria-label="Language"|Settings/)
  assert.match(html, /<section[^>]*aria-label="Connect project"/)
  assert.match(html, /Open project folder/)
  assert.doesNotMatch(html, /Create worktree/)
})

test("connected projects open the first project without a selection page", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const html = renderToStaticMarkup(
    createElement(ProjectManager, {
      api: {},
      initialProjects: [{ id: "one", name: "My project", location: { kind: "git" } }],
    }),
  )
  assert.doesNotMatch(html, /Select a project/)
  assert.match(html, /aria-haspopup="menu"/)
  const doc = new JSDOM(html).window.document
  assert.equal(doc.querySelectorAll('[role="combobox"]').length, 0)
  assert.ok(!doc.querySelector('[role="radiogroup"][aria-label="Language"]'))
  assert.doesNotMatch(html, /Projects \(/)
  assert.doesNotMatch(html, /<form|Create worktree|Attach worktree/)
})

test("worktree navigation lives below the sole project control in the sidebar", async () => {
  const { WorktreeSidebar } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const html = renderToStaticMarkup(
    withSidebar(
      createElement(WorktreeSidebar, {
        projectMenu: createElement("button", { type: "button" }, "Selected project"),
        worktrees: [
          {
            id: "tree-one",
            checkoutRoot: "/repo/feature",
          },
        ],
        selectedId: "tree-one",
        pending: false,
        loading: false,
        onSelect() {},
        onRefresh() {},
      }),
    ),
  )
  assert.match(html, /data-slot="sidebar"/)
  assert.match(html, /aria-label="Worktrees"/)
  assert.match(html, /aria-current="page"/)
  assert.ok(html.indexOf("Selected project") < html.indexOf("Worktrees"))
  const header = new JSDOM(html).window.document.querySelector('[data-slot="sidebar-header"]')
  assert.equal(header.textContent, "Selected project")
  assert.equal(header.children.length, 1)
  assert.doesNotMatch(new JSDOM(html).window.document.body.textContent, /\/repo\/feature/)
  assert.match(html, /aria-label="feature"/)
  assert.doesNotMatch(html, /Managed|External|attached|detached/)
  assert.doesNotMatch(html, /Workspace|<table/)
})

test("worktree viewer hides manual setup forms by default", async () => {
  const { WorktreePanel } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const html = renderToStaticMarkup(
    withSidebar(
      createElement(WorktreePanel, {
        api: {},
        project: { id: "one", name: "Project", location: { kind: "git" } },
        projectMenu: null,
        onBusy() {},
      }),
    ),
  )
  assert.doesNotMatch(html, /<form|Existing checkout directory|Create worktree/)
  assert.doesNotMatch(html, /Manage worktrees/)
  assert.match(html, /Settings/)
})

test("observed results show actual failures and never promote parsed assertions to passed", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const html = renderToStaticMarkup(
    createElement(TestEvidence, {
      submission: {
        id: "s1",
        digest: "abc",
        files: [{ path: "real.test.ts", source: "expect(actual).toBe(2)" }],
        parsed: [
          {
            path: "real.test.ts",
            review: {
              scenarios: [
                {
                  title: "real test",
                  intent: "Check real value",
                  assertions: [{ code: "expect(actual).toBe(2)", observed: "unknown" }],
                },
              ],
              limitations: [],
            },
          },
        ],
      },
      run: {
        state: "finished",
        limitations: ["Scenario-level observation"],
        result: {
          outcome: "assertion_failed",
          cases: [
            {
              name: "real test",
              file: "real.test.ts",
              state: "failed",
              errors: [{ name: "AssertionError", message: "expected 1 to be 2" }],
            },
          ],
          errors: [],
        },
      },
    }),
  )
  assert.match(html, /expected 1 to be 2/)
  assert.match(html, /assertion_failed/)
  assert.match(html, /aria-label="Failed"/)
  assert.doesNotMatch(html, /aria-label="Success"/)
  assert.doesNotMatch(html, /expect\(actual\)/)
})

test("워크트리 헤더는 존재 여부 응답 전 탭을 미리 표시하지 않는다", async () => {
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const html = renderToStaticMarkup(createElement(WorktreeReview, { api: {}, worktreeId: "tree" }))
  assert.doesNotMatch(html, /role="tab"/)
  assert.doesNotMatch(html, /checkout-api|wt-orders|Preview dataset/)
})

test("an empty Git patch is a clean comparison rather than an unnamed file", async () => {
  const { parseGitPatch } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  assert.deepEqual(parseGitPatch(""), [])
})

test("deleted files retain their repository path in the file tree", async () => {
  const { parseGitPatch } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const files = parseGitPatch(
    "diff --git a/src/old.ts b/src/old.ts\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/src/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const old = true\n",
  )
  assert.equal(files[0].newPath || files[0].oldPath, "src/old.ts")
  assert.equal(files[0].type, "delete")
})

test("empty project startup has no workspace shell", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const html = renderToStaticMarkup(createElement(ProjectManager, { api: {}, initialProjects: [] }))
  assert.doesNotMatch(html, /Local server|Local projects/)
  assert.doesNotMatch(html, /data-slot="sidebar-trigger"/)
  assert.doesNotMatch(html, /No project open/)
  assert.doesNotMatch(html, /Select a project/)
})
