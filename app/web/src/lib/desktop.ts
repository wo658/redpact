type DesktopWindow = Window & {
  __TAURI__?: { core: { invoke: <T>(command: string) => Promise<T> } }
}

export function desktopInvoke() {
  return typeof window === "undefined"
    ? undefined
    : (window as DesktopWindow).__TAURI__?.core.invoke
}

export const repositoryUrl = "https://github.com/wo658/redpact"
