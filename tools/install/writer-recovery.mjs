import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const installed = process.argv[2]
assert.ok(installed, "Pass the installed package directory")
const module = pathToFileURL(join(installed, "dist/adapters/storage/files.js")).href
const directory = await mkdtemp(join(tmpdir(), "redpact-installed-writer-"))
const children = []
const source = `import {openStore} from ${JSON.stringify(module)};
process.on('message', () => {
  try {
    const storage = openStore(process.argv[1]);
    process.send({acquired:true});
    process.on('disconnect', () => {storage.close(); process.exit(0)});
  } catch (error) {process.send({acquired:false,error:String(error)}); process.disconnect()}
});`
function launch() {
  const child = spawn(process.execPath, ["--input-type=module", "-e", source, directory], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  })
  const exit = once(child, "exit")
  let stderr = ""
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  const reply = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Writer response timed out: ${stderr}`)),
      10000,
    )
    child.once("message", (message) => {
      clearTimeout(timeout)
      resolve(message)
    })
    child.once("exit", () => {
      clearTimeout(timeout)
      reject(new Error(`Writer exited before response: ${stderr}`))
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
  children.push({ child, exit })
  child.send("start")
  return { child, exit, reply }
}
try {
  await writeFile(join(directory, "evidence.txt"), "preserved")
  const owner = launch()
  assert.deepEqual(await owner.reply, { acquired: true })
  const marker = await readFile(join(directory, ".writer.lock"), "utf8")
  const contender = launch()
  assert.equal((await contender.reply).acquired, false, "A live writer must exclude contenders")
  await contender.exit
  owner.child.kill("SIGKILL")
  await owner.exit
  const contenders = Array.from({ length: 6 }, launch)
  const replies = await Promise.all(contenders.map((value) => value.reply))
  assert.equal(
    replies.filter((reply) => reply.acquired).length,
    1,
    "Exactly one process must recover",
  )
  const backups = (await readdir(directory)).filter((name) =>
    name.startsWith(".writer.lock.stale-"),
  )
  assert.equal(backups.length, 1)
  assert.equal(await readFile(join(directory, backups[0]), "utf8"), marker)
  assert.equal(await readFile(join(directory, "evidence.txt"), "utf8"), "preserved")
  for (const { child } of contenders) {
    if (child.connected) {
      child.disconnect()
    }
  }
  await Promise.all(contenders.map((value) => value.exit))
  const next = launch()
  assert.deepEqual(await next.reply, { acquired: true })
  next.child.disconnect()
  await next.exit
  console.log(
    `PASS: installed writer crash recovery and exclusion; ${process.platform}/${process.arch}; ${process.version}`,
  )
} finally {
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
    }
  }
  await Promise.all(children.map((value) => value.exit))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
