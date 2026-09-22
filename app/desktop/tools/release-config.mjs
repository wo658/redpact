import { appendFile, readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

export function releaseEnvironment({ version, tag, config, privateKey, mode = "signed" }) {
  if (mode === "preview") {
    if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `desktop-preview-v${version}`) {
      throw new Error("Preview tag must equal desktop-preview-v followed by the Tauri version")
    }
    return {}
  }
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
    throw new Error("Release tag must equal v followed by the stable Tauri version")
  }
  if (!privateKey?.trim()) {
    throw new Error("Missing updater private key: TAURI_SIGNING_PRIVATE_KEY")
  }
  if (config.bundle?.createUpdaterArtifacts !== true) {
    throw new Error("Signed updater artifacts must be enabled")
  }
  const { pubkey, endpoints } = config.plugins?.updater ?? {}
  const decoded = Buffer.from(pubkey ?? "", "base64")
    .toString("utf8")
    .trim()
    .split("\n")
  if (
    decoded.length !== 2 ||
    !decoded[0].startsWith("untrusted comment:") ||
    Buffer.from(decoded[1], "base64").length !== 42
  ) {
    throw new Error("Missing or invalid updater public key")
  }
  if (
    endpoints?.length !== 1 ||
    endpoints[0] !== "https://github.com/wo658/redpact/releases/latest/download/latest.json"
  ) {
    throw new Error("Release endpoint must use the public Redpact GitHub Release feed")
  }
  return { REDPACT_UPDATE_ENDPOINT: endpoints[0], REDPACT_UPDATE_PUBLIC_KEY: pubkey }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = async (name) =>
    JSON.parse(await readFile(new URL(`../src-tauri/${name}`, import.meta.url), "utf8"))
  const base = await read("tauri.conf.json")
  const config = await read("tauri.release.conf.json")
  const environment = releaseEnvironment({
    version: base.version,
    mode: process.env.REDPACT_RELEASE_MODE,
    tag: process.env.GITHUB_REF_NAME,
    config,
    privateKey: process.env.TAURI_SIGNING_PRIVATE_KEY,
  })
  if (!process.env.GITHUB_ENV) {
    throw new Error("GITHUB_ENV is required")
  }
  await appendFile(
    process.env.GITHUB_ENV,
    Object.entries(environment)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  )
}
