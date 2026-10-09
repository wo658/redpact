import { type ComponentProps, useEffect, useState } from "react"
import { hasViewerTransport, viewerFetch } from "@/lib/viewer-transport"

function useAsset(path?: string) {
  const bridged = hasViewerTransport() && path?.startsWith("/api/")
  const [asset, setAsset] = useState<{ path: string; url: string }>()
  useEffect(() => {
    if (!bridged || !path) {
      return
    }
    const controller = new AbortController()
    let url: string | undefined
    void viewerFetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Artifact unavailable")
        }
        const blob = await response.blob()
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob)
          setAsset({ path, url })
        }
      })
      .catch(() => {})
    return () => {
      controller.abort()
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [bridged, path])
  if (!bridged) {
    return path
  }
  return asset && asset.path === path ? asset.url : undefined
}
export function ViewerImage({ src, alt, ...props }: ComponentProps<"img">) {
  return <img {...props} alt={alt} src={useAsset(src)} />
}
export function ViewerLink({ href, ...props }: ComponentProps<"a">) {
  return <a {...props} href={useAsset(href)} />
}
