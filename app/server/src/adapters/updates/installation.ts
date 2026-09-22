import { access, readFile, realpath } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { valid } from "semver"
import { runtimePackageName, runtimePackagePath } from "./package.js"

export type Installation = {
  manager: "npm" | "pnpm"
  global: boolean
  development?: boolean
  cwd: string
  entry: string
}
const packageRoot = fileURLToPath(new URL("../../../", import.meta.url))
async function samePackage(path: string, reference: string) {
  try {
    return (await realpath(path)) === (await realpath(reference))
  } catch {
    return false
  }
}
async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
export async function detectInstallation(reference = packageRoot): Promise<Installation | null> {
  const manifest = JSON.parse(await readFile(join(reference, "package.json"), "utf8"))
  if (manifest.name !== runtimePackageName) {
    return null
  }
  const root = await realpath(reference)
  if (root.split(sep).includes("_npx")) {
    return null
  }
  for (const manager of ["npm", "pnpm"] as const) {
    try {
      const result = await execa(manager, ["root", "--global"], { timeout: 5000 })
      const modules = result.stdout.trim()
      if (await samePackage(runtimePackagePath(modules), reference)) {
        return {
          manager,
          global: true,
          cwd: process.cwd(),
          entry: join(runtimePackagePath(modules), "dist/main.js"),
        }
      }
    } catch {
      /* An unavailable package manager cannot own this installation. */
    }
  }
  return detectLocal(root, reference)
}

async function detectLocal(root: string, reference: string): Promise<Installation | null> {
  const marker = `${sep}node_modules${sep}`
  const index = root.indexOf(marker)
  if (index < 0) {
    return null
  }
  const cwd = root.slice(0, index)
  if (!(await samePackage(runtimePackagePath(join(cwd, "node_modules")), reference))) {
    return null
  }
  const project = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"))
  if (
    !project.dependencies?.[runtimePackageName] &&
    !project.devDependencies?.[runtimePackageName]
  ) {
    return null
  }
  const manager = (await exists(join(cwd, "pnpm-lock.yaml"))) ? "pnpm" : "npm"
  if (project.packageManager && !project.packageManager.startsWith(`${manager}@`)) {
    return null
  }
  if (
    manager === "npm" &&
    (!(await exists(join(cwd, "package-lock.json"))) ||
      (await exists(join(cwd, "yarn.lock"))) ||
      (await exists(join(cwd, "bun.lock"))))
  ) {
    return null
  }
  return {
    manager,
    global: false,
    development: Boolean(
      project.devDependencies?.[runtimePackageName] && !project.dependencies?.[runtimePackageName],
    ),
    cwd,
    entry: join(runtimePackagePath(join(cwd, "node_modules")), "dist/main.js"),
  }
}

export async function installRuntime(installation: Installation, version: string) {
  if (valid(version) !== version) {
    throw new Error("Invalid update version")
  }
  const current = await detectInstallation(dirname(dirname(installation.entry)))
  if (
    !current ||
    current.manager !== installation.manager ||
    current.global !== installation.global ||
    current.development !== installation.development ||
    resolve(current.entry) !== resolve(installation.entry)
  ) {
    throw new Error("Installation ownership changed. Restart Redpact before updating.")
  }
  const args = [installation.manager === "npm" ? "install" : "add"]
  if (installation.global) {
    args.push("--global")
  }
  if (installation.development) {
    args.push("--save-dev")
  }
  args.push(
    `${runtimePackageName}@${version}`,
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org/",
  )
  await execa(installation.manager, args, {
    cwd: installation.cwd,
    timeout: 180000,
    stdio: "inherit",
  })
  const manifest = JSON.parse(
    await readFile(join(dirname(dirname(installation.entry)), "package.json"), "utf8"),
  )
  if (manifest.name !== runtimePackageName || manifest.version !== version) {
    throw new Error("Installed version does not match the requested update")
  }
}
