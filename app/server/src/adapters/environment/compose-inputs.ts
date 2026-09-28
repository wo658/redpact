import { createHash } from "node:crypto"
import { constants } from "node:fs"
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { Ignore } from "@balena/dockerignore"
import { execa } from "execa"
import type { Environment } from "../../core/types/environment.js"
import { minimalEnvironment } from "../process/environment.js"
import type { EffectiveCompose } from "./compose-model.js"
import { contained } from "./inputs.js"
import { stageSelection } from "./selection.js"

const dockerIgnore = createRequire(import.meta.url)("@balena/dockerignore") as (options: {
  ignorecase: boolean
}) => Ignore

type Inputs = Pick<Environment, "settings" | "plan">

// Resolve Compose before inspecting application files; it owns context and merge semantics.
async function resolveInputs(root: string, inputs: Inputs) {
  const temporary = await mkdtemp(join(tmpdir(), "redpact-compose-config-"))
  try {
    const placeholders = Object.fromEntries(
      inputs.plan.requiredSecrets.map((name) => [name, "redpact-input-inspection"]),
    )
    const selected = await stageSelection(temporary, inputs, placeholders, root)
    const result = await execa(
      "docker",
      [
        "compose",
        "--project-name",
        "redpact-input-inspection",
        "--project-directory",
        dirname(join(root, inputs.settings.environment.compose.files[0])),
        ...selected.files.flatMap((file) => ["-f", join(temporary, file)]),
        "--profile",
        "*",
        "config",
        "--format",
        "json",
      ],
      {
        cwd: root,
        env: { ...minimalEnvironment(), ...selected.variables },
        extendEnv: false,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    const model: EffectiveCompose = JSON.parse(result.stdout)
    model.services = Object.fromEntries(
      Object.entries(model.services).filter(([name]) => inputs.plan.activeServices.includes(name)),
    )
    return model
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

async function optionalFile(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Docker ignore file must be a regular file: ${path}`)
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!(await handle.stat()).isFile()) {
        throw new Error(`Docker ignore file must be a regular file: ${path}`)
      }
      return await handle.readFile("utf8")
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

async function destinationDirectory(root: string, path: string) {
  let current = root
  await mkdir(current, { recursive: true, mode: 0o700 })
  for (const part of relative(root, path).split("/").filter(Boolean)) {
    current = join(current, part)
    try {
      await mkdir(current, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error
      }
    }
    if (!(await lstat(current)).isDirectory()) {
      throw new Error("Captured input parent changed type")
    }
  }
}

async function contextPaths(root: string, context: string, dockerfile?: string) {
  // Compose owns external/remote paths. Redpact never reads or copies their contents.
  const local = relative(root, context)
  if (!isAbsolute(context) || local === ".." || local.startsWith("../") || isAbsolute(local)) {
    return new Set<string>()
  }
  const canonical = await realpath(context).catch(() => undefined)
  if (canonical !== context) {
    return new Set<string>()
  }
  const recipe = dockerfile ? resolve(context, dockerfile) : undefined
  const recipePath = recipe ? relative(context, recipe) : ""
  if (recipePath === ".." || recipePath.startsWith("../") || isAbsolute(recipePath)) {
    return new Set<string>()
  }
  if (recipe && (await realpath(recipe).catch(() => undefined)) !== recipe) {
    return new Set<string>()
  }
  for (const path of [
    ...(recipe ? [`${recipe}.dockerignore`] : []),
    join(context, ".dockerignore"),
  ]) {
    try {
      if ((await lstat(path)).isSymbolicLink()) {
        return new Set<string>()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
  }
  const specific = recipe ? await optionalFile(`${recipe}.dockerignore`) : undefined
  const ignorePath =
    specific === undefined ? join(context, ".dockerignore") : `${recipe}.dockerignore`
  const source = specific ?? (await optionalFile(ignorePath)) ?? ""
  const matcher = dockerIgnore({ ignorecase: false }).add(source)
  const exceptions = source.split(/\r?\n/).some((line) => line.trim().startsWith("!"))
  const paths = new Set<string>(recipe ? [recipe] : [])
  if ((await optionalFile(ignorePath)) !== undefined) {
    paths.add(ignorePath)
  }
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const ignored = matcher.ignores(relative(context, path))
      if (!ignored) {
        paths.add(path)
      }
      // Docker permits negations to restore descendants of an excluded directory.
      if (entry.isDirectory() && (!ignored || exceptions)) {
        await walk(path)
      }
    }
  }
  await walk(context)
  return paths
}

async function capturePath(
  root: string,
  path: string,
  hash: ReturnType<typeof createHash>,
  destination?: string,
) {
  const rel = relative(root, path)
  if (contained(root, await realpath(dirname(path))) !== dirname(path)) {
    throw new Error(`Build input parent changed type: ${rel}`)
  }
  const stat = await lstat(path)
  const mode = stat.mode & 0o777
  const target = destination ? join(destination, rel) : undefined
  if (target && destination) {
    await destinationDirectory(destination, dirname(target))
  }
  if (stat.isSymbolicLink()) {
    const link = await readlink(path)
    hash.update(JSON.stringify([rel, "symlink", link]))
    if (target) {
      await symlink(link, target)
    }
    return
  }
  if (stat.isDirectory()) {
    hash.update(JSON.stringify([rel, "directory", mode]))
    if (target && destination) {
      await destinationDirectory(destination, target)
    }
    return { path: target, mode }
  }
  if (!stat.isFile()) {
    throw new Error(`Build context input is not a regular file: ${rel}`)
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const current = await handle.stat()
    const data = await handle.readFile()
    if (!current.isFile() || data.length !== current.size) {
      throw new Error(`Build context input changed while being copied: ${rel}`)
    }
    hash.update(JSON.stringify([rel, current.mode & 0o777, data.length])).update(data)
    if (target) {
      await writeFile(target, data, { flag: "wx", mode: current.mode & 0o777 })
    }
  } finally {
    await handle.close()
  }
}

export async function snapshotComposeInputs(root: string, inputs: Inputs, destination?: string) {
  root = await realpath(root)
  const model = await resolveInputs(root, inputs)
  const builds = Object.values(model.services).flatMap((service) =>
    service.build ? [service.build] : [],
  )
  const paths = new Set(inputs.settings.environment.compose.files.map((file) => join(root, file)))
  for (const build of builds) {
    for (const path of await contextPaths(
      root,
      build.context,
      build.dockerfile_inline ? undefined : (build.dockerfile ?? "Dockerfile"),
    )) {
      paths.add(path)
    }
  }
  for (const path of [...paths]) {
    let parent = dirname(path)
    while (parent !== root) {
      paths.add(contained(root, parent))
      parent = dirname(parent)
    }
  }
  const hash = createHash("sha256").update(JSON.stringify(model))
  const directories: { path: string | undefined; mode: number }[] = []
  for (const path of [...paths].sort()) {
    const directory = await capturePath(root, path, hash, destination)
    if (directory) {
      directories.push(directory)
    }
  }
  for (const directory of directories.reverse()) {
    if (directory.path) {
      await chmod(directory.path, directory.mode)
    }
  }
  return hash.digest("hex")
}
