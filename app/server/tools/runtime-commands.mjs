import { win32 } from "node:path"
import { execaSync } from "execa"

export function nodeArchiveCommand(
  platform = process.platform,
  windowsRoot = process.env.SystemRoot,
) {
  if (platform === "win32") {
    if (!windowsRoot) {
      throw new Error("SystemRoot is required to locate the Windows archive tool")
    }
    return win32.join(windowsRoot, "System32", "tar.exe")
  }
  return "tar"
}

export function runPnpm(args, options) {
  return execaSync("pnpm", args, options)
}
