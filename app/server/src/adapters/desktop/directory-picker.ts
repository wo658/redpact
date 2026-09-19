import { stat } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { execa } from "execa"
import { problem } from "../../core/problems.js"
import type { DirectoryDialog } from "../../core/types/directory-picker.js"

// Fixed scripts never interpolate browser input or selected paths into commands.
const macScript = `
(function () {
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  try {
    return JSON.stringify(String(app.chooseFolder({withPrompt: "Select a Redpact project folder"})));
  } catch (error) {
    if (error.errorNumber === -128) return "null";
    throw error;
  }
})()`
const windowsScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a Redpact project folder'
$dialog.ShowNewFolderButton = $false
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    ConvertTo-Json -Compress -InputObject $dialog.SelectedPath
  } else { 'null' }
} finally { $dialog.Dispose() }
`

type Execute = (
  file: string,
  args: string[],
  signal: AbortSignal,
) => Promise<{
  stdout: string
  exitCode?: number
  timedOut?: boolean
  code?: string
}>
const executeNative: Execute = (file, args, signal) =>
  execa(file, args, {
    cancelSignal: signal,
    timeout: 120000,
    forceKillAfterDelay: 1000,
    maxBuffer: 16384,
    stripFinalNewline: false,
    reject: false,
    windowsHide: true,
  })

export function createNativeDirectoryPicker(
  options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; execute?: Execute } = {},
): DirectoryDialog {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const execute = options.execute ?? executeNative
  return {
    async pick(signal) {
      const [file, args] = command(platform, env)
      const result = await execute(file, args, signal)
      if (signal.aborted) {
        return null
      }
      if (result.code === "ENOENT") {
        problem(
          "directory_picker_unavailable",
          "The OS folder picker is unavailable. Enter the project path manually; Linux requires Zenity and a desktop session.",
        )
      }
      if (platform === "linux" && result.exitCode === 1 && !result.timedOut) {
        return null
      }
      if (result.exitCode !== 0 || result.timedOut) {
        problem(
          "directory_picker_failed",
          "The OS folder picker could not complete. Retry or enter the project path manually.",
        )
      }
      let path: unknown
      try {
        path =
          platform === "linux" ? result.stdout.replace(/\r?\n$/, "") : JSON.parse(result.stdout)
        if (path === null) {
          return null
        }
        if (typeof path !== "string" || !isAbsolute(path) || !(await stat(path)).isDirectory()) {
          throw new Error("Invalid directory")
        }
      } catch {
        problem(
          "directory_picker_failed",
          "The selected folder is no longer available. Select an existing project folder.",
        )
      }
      return path
    },
  }
}

function command(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): [string, string[]] {
  if (platform === "darwin") {
    return ["/usr/bin/osascript", ["-l", "JavaScript", "-e", macScript]]
  }
  if (platform === "win32") {
    return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", windowsScript]]
  }
  if (platform === "linux" && (env.DISPLAY || env.WAYLAND_DISPLAY)) {
    return [
      "zenity",
      ["--file-selection", "--directory", "--title=Select a Redpact project folder"],
    ]
  }
  problem(
    "directory_picker_unavailable",
    "Folder selection requires a supported desktop session on the Redpact server. Enter the project path manually.",
  )
}
