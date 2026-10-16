import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

import { build as buildViewer } from "../../app/web/node_modules/vite/dist/node/index.js"

const root = new URL("./", import.meta.url)
const target = new URL("dist/redpact-marketplace/plugins/redpact-app/", root)
const runtimePort = 54322
await mkdir(new URL("dist/", target), { recursive: true })
const viewerBuild = await buildViewer({
  root: fileURLToPath(new URL("../../app/web/", root)),
  base: "./",
  mode: "sidebar",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  logLevel: "warn",
  build: {
    outDir: fileURLToPath(new URL("dist/viewer/", target)),
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: fileURLToPath(new URL("../../app/web/src/entries/sidebar.tsx", root)),
      formats: ["es"],
      fileName: "sidebar",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
const viewerChunks = (Array.isArray(viewerBuild) ? viewerBuild : [viewerBuild])
  .flatMap((bundle) => bundle.output)
  .filter((asset) => asset.type === "chunk")
const packages = new Set(
  viewerChunks
    .flatMap((chunk) => Object.keys(chunk.modules))
    .map((id) => id.match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1])
    .filter(Boolean),
)
const notices = []
for (const directory of packages) {
  for (const name of (await readdir(directory)).filter((name) =>
    /^(license|licence|notice|ofl)(\.|$)/i.test(name),
  )) {
    notices.push(
      `${directory.split("node_modules/").at(-1)} / ${name}\n${await readFile(`${directory}/${name}`, "utf8")}`,
    )
  }
}
await writeFile(new URL("dist/THIRD_PARTY_LICENSES", target), notices.join("\n\n"))
await cp(new URL("../../app/web/LICENSE", root), new URL("dist/LICENSE", target))
await mkdir(new URL("assets/", target), { recursive: true })
await cp(new URL("../../app/web/public/favicon.svg", root), new URL("assets/favicon.svg", target))
await cp(
  new URL("../../app/web/public/apple-touch-icon.png", root),
  new URL("assets/icon.png", target),
)
await cp(new URL("../../app/web/NOTICE", root), new URL("dist/NOTICE", target))
await cp(new URL("../../app/web/licenses/", root), new URL("dist/licenses/", target), {
  recursive: true,
})
await mkdir(new URL(".codex-plugin/", target), { recursive: true })
await rm(new URL("skills/", target), { recursive: true, force: true })
await cp(new URL("../../plugins/redpact/skills/", root), new URL("skills/", target), {
  recursive: true,
})
for (const name of ["redpact", "redpact-init"]) {
  const metadata = new URL(`skills/${name}/agents/openai.yaml`, target)
  await writeFile(
    metadata,
    (await readFile(metadata, "utf8"))
      .replace('value: "redpact"', 'value: "redpact-verification"')
      .replace("http://127.0.0.1:54321/mcp", `http://127.0.0.1:${runtimePort}/mcp`),
  )
}
const favicon = await readFile(new URL("../../app/web/public/favicon.svg", root))
const template = (await readFile(new URL("src/redpact/app.html", root), "utf8")).replaceAll(
  "APP_FAVICON",
  `data:image/svg+xml;base64,${favicon.toString("base64")}`,
)
const output = (Array.isArray(viewerBuild) ? viewerBuild : [viewerBuild]).flatMap(
  (bundle) => bundle.output,
)
const script = output
  .filter((asset) => asset.type === "chunk")
  .map((asset) => asset.code)
  .join("\n")
const css = output
  .filter((asset) => asset.type === "asset" && asset.fileName.endsWith(".css"))
  .map((asset) => asset.source)
  .join("\n")
const sprite = await readFile(new URL("../../app/web/public/icons.svg", root), "utf8")
await writeFile(
  new URL("dist/app.html", target),
  template
    .replace("</head>", () => `<style>${css}</style></head>`)
    .replace("<body>", () => `<body><div hidden>${sprite}</div>`)
    .replace("/* APP_SCRIPT */", () => script.replaceAll("</script", "<\\/script")),
)

await build({
  entryPoints: [fileURLToPath(new URL("src/redpact/main.ts", root))],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outfile: fileURLToPath(new URL("dist/server.mjs", target)),
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
})
await writeFile(
  new URL("dist/config.json", target),
  JSON.stringify(
    {
      port: runtimePort,
      runtimeVersion: "0.8.0",
    },
    null,
    2,
  ),
)
await rm(new URL(".codex-plugin/", target), { recursive: true, force: true })
await rm(new URL(".mcp.json", target), { force: true })
await writeFile(
  new URL("plugin.json", target),
  JSON.stringify(
    {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "redpact",
      version: "0.6.0",
      description:
        "Manage projects, environments and settings in the app, with separate chat approval and evidence cards.",
      author: { name: "Redpact contributors" },
      extensions: {
        "com.openai": {
          interface: {
            displayName: "Redpact",
            composerIcon: "./assets/icon.png",
            logo: "./assets/icon.png",
            shortDescription: "Full workspace, connected chat verification.",
            developerName: "Redpact contributors",
            category: "Developer Tools",
            defaultPrompt: ["Open the Redpact App Page."],
          },
        },
      },
    },
    null,
    2,
  ),
)
// The portable MCP loader resolves contained commands and PLUGIN_ROOT from the installed copy.
const pluginRootVariable = "$" + "{PLUGIN_ROOT}"
await writeFile(
  new URL("mcp.json", target),
  JSON.stringify(
    {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        "redpact-verification": { type: "http", url: `http://127.0.0.1:${runtimePort}/mcp` },
        "redpact-app": {
          type: "stdio",
          command: "./bin/node",
          args: [`${pluginRootVariable}/dist/server.mjs`],
          cwd: "./",
        },
      },
    },
    null,
    2,
  ),
)
const catalog = new URL("dist/redpact-marketplace/.agents/plugins/", root)
await mkdir(catalog, { recursive: true })
await writeFile(
  new URL("marketplace.json", catalog),
  JSON.stringify(
    {
      name: "redpact",
      interface: { displayName: "Redpact" },
      plugins: [
        {
          name: "redpact",
          source: { source: "local", path: "./plugins/redpact-app" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Developer Tools",
        },
      ],
    },
    null,
    2,
  ),
)
console.log(`Redpact App marketplace: ${fileURLToPath(new URL("dist/redpact-marketplace", root))}`)

await cp(new URL("../../LICENSE", root), new URL("LICENSE", target))
await writeFile(
  new URL("package.json", target),
  `${JSON.stringify(
    {
      name: "@wo658/redpact-plugin",
      version: "0.6.0",
      description: "Redpact sidebar app with explicit npm/pnpm runtime installation",
      license: "Apache-2.0",
      repository: {
        type: "git",
        url: "git+https://github.com/wo658/redpact.git",
        directory: "examples/sidebar-app",
      },
      os: ["darwin"],
      cpu: ["arm64"],
      files: [
        "plugin.json",
        "mcp.json",
        "assets",
        "bin",
        "dist",
        "skills",
        "tooling",
        "runtime-artifact.json",
        "LICENSE",
      ],
      publishConfig: { access: "public" },
    },
    null,
    2,
  )}\n`,
)
