import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { parse, stringify } from "yaml"
import { runPnpm } from "./runtime-commands.mjs"

const { values } = parseArgs({ options: { directory: { type: "string" } } })
const root = fileURLToPath(new URL("../../../", import.meta.url))
const server = join(root, "app/server")
const stage = await mkdtemp(join(tmpdir(), "redpact-package-"))
const output = join(root, "dist")
const manifest = JSON.parse(await readFile(join(server, "package.json"), "utf8"))
const workspace = parse(await readFile(join(root, "pnpm-workspace.yaml"), "utf8"))
const lock = parse(await readFile(join(root, "pnpm-lock.yaml"), "utf8"))

try {
  // Install the server's existing locked graph, independently of the development workspace.
  lock.importers = { ".": lock.importers["app/server"] }
  manifest.name = "@wo658/redpact"
  manifest.private = false
  manifest.description = "Local development review with Vitest submissions and runtime evidence"
  manifest.bin = { redpact: "dist/cli.js" }
  manifest.files = ["dist", "README.md", "LICENSE", "NOTICE", "licenses"]
  manifest.publishConfig = { access: "public", registry: "https://registry.npmjs.org/" }
  manifest.repository = { type: "git", url: "git+https://github.com/wo658/redpact.git" }
  manifest.homepage = "https://github.com/wo658/redpact#readme"
  manifest.bugs = { url: "https://github.com/wo658/redpact/issues" }
  // Consumers do not inherit workspace patches or overrides. Ship both locked graphs.
  manifest.bundledDependencies = ["testcontainers", "umzug"]
  delete manifest.scripts
  await writeFile(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(stage, "pnpm-lock.yaml"), stringify(lock))
  await writeFile(
    join(stage, "pnpm-workspace.yaml"),
    stringify({
      nodeLinker: "hoisted",
      patchedDependencies: workspace.patchedDependencies,
      overrides: workspace.overrides,
      minimumReleaseAgeExclude: workspace.minimumReleaseAgeExclude,
      verifyDepsBeforeRun: false,
    }),
  )
  await cp(join(root, "patches"), join(stage, "patches"), { recursive: true })
  await cp(join(server, "dist"), join(stage, "dist"), { recursive: true })
  // Pack the entire web output so additional built pages travel with the server.
  await cp(join(root, "app/web/dist"), join(stage, "dist/ui"), { recursive: true })
  await cp(join(root, "app/web/licenses"), join(stage, "dist/ui/licenses"), { recursive: true })
  await cp(join(server, "PACKAGE_README.md"), join(stage, "README.md"))
  await cp(join(root, "LICENSE"), join(stage, "LICENSE"))
  await cp(join(root, "app/web/NOTICE"), join(stage, "NOTICE"))
  await cp(join(root, "app/web/licenses"), join(stage, "licenses"), { recursive: true })
  runPnpm(["install", "--prod", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: stage,
    stdio: "inherit",
  })
  delete manifest.devDependencies
  await writeFile(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  if (values.directory) {
    await cp(stage, values.directory, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    })
    console.log(values.directory)
  } else {
    await mkdir(output, { recursive: true })
    runPnpm(["pack", "--json", "--out", join(output, `redpact-${manifest.version}.tgz`)], {
      cwd: stage,
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 10 * 1024 * 1024,
    })
    console.log(join(output, `redpact-${manifest.version}.tgz`))
  }
} finally {
  await rm(stage, { recursive: true, force: true })
}
