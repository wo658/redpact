import { type ComponentProps, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { hasViewerTransport, viewerFetch } from "@/lib/viewer-transport"
import { Loading, Notice } from "./feedback"

function imageDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function useAsset(path?: string, inline = false): { url?: string; error?: string } {
  const bridged = hasViewerTransport() && path?.startsWith("/api/")
  const [asset, setAsset] = useState<{ path: string; url?: string; error?: string }>()
  useEffect(() => {
    if (!bridged || !path) {
      return
    }
    const controller = new AbortController()
    let url: string | undefined
    void viewerFetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Artifact unavailable (${response.status})`)
        }
        const blob = await response.blob()
        if (controller.signal.aborted) {
          return
        }
        // Embedded hosts may allow data images while rejecting blob: image sources.
        const source = inline ? await imageDataUrl(blob) : URL.createObjectURL(blob)
        if (!inline) {
          url = source
        }
        if (!controller.signal.aborted) {
          setAsset({ path, url: source })
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setAsset({ path, error: String(cause) })
        }
      })
    return () => {
      controller.abort()
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [bridged, path, inline])
  if (!bridged) {
    return { url: path }
  }
  return asset && asset.path === path ? asset : {}
}
export function ViewerImage({ src, alt, onError, ...props }: ComponentProps<"img">) {
  const { t } = useTranslation()
  const asset = useAsset(src, true)
  const [failedUrl, setFailedUrl] = useState<string>()
  const decodeFailed = asset.url !== undefined && asset.url === failedUrl
  if (asset.error || decodeFailed) {
    return (
      <Notice error>
        {t("Unable to load image: {{name}}", { name: alt ?? "" })}
        {"\n"}
        {asset.error ?? t("This image could not be decoded.")}
      </Notice>
    )
  }
  if (!asset.url) {
    return <Loading>{t("Loading image: {{name}}", { name: alt ?? "" })}</Loading>
  }
  return (
    <img
      {...props}
      alt={alt}
      src={asset.url}
      onError={(event) => {
        setFailedUrl(asset.url)
        onError?.(event)
      }}
    />
  )
}
export function ViewerLink({ href, ...props }: ComponentProps<"a">) {
  return <a {...props} href={useAsset(href).url} />
}
