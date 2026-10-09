// The companion supplies a same-origin base path; standalone viewers keep root URLs.
export function viewerUrl(path: string) {
  const base =
    typeof document === "undefined"
      ? undefined
      : document.querySelector('meta[name="redpact-base"]')?.getAttribute("content")
  if (base && /^\/[a-zA-Z0-9_-]+\/$/.test(base)) {
    return `${base}${path.replace(/^\//, "")}`
  }
  return path
}
