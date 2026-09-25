type DesktopWindow = Window & {
  __TAURI__?: {
    core?: { invoke: <T>(command: string) => Promise<T> }
    window?: { getCurrentWindow: () => NativeWindow }
  }
}

export function desktopInvoke() {
  return typeof window === "undefined"
    ? undefined
    : (window as DesktopWindow).__TAURI__?.core?.invoke
}

export const repositoryUrl = "https://github.com/wo658/redpact"

interface NativeWindow {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

export function desktopPlatform() {
  if (typeof document === "undefined") {
    return undefined
  }
  const platform = document.documentElement.dataset.desktop
  return platform === "macos" || platform === "windows" ? platform : undefined
}

export function desktopWindow() {
  return typeof window === "undefined"
    ? undefined
    : (window as DesktopWindow).__TAURI__?.window?.getCurrentWindow()
}
