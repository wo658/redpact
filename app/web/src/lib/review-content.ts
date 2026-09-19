import type { Api, CaptureArtifact, CaptureRun, PlaywrightFile } from "./api"

export function captureMatchesMode(artifact: CaptureArtifact, mobileMode: boolean) {
  return (
    artifact.contentType === "image/png" &&
    (!artifact.viewport || artifact.viewport.width < 768 === mobileMode)
  )
}

export function captureRunMatchesMode(run: CaptureRun, path: string, mobileMode: boolean) {
  const images = run.after.cases
    .filter((scenario) => scenario.file === path)
    .flatMap((scenario) =>
      scenario.artifacts.filter((artifact) => artifact.contentType === "image/png"),
    )
  // An empty latest execution must not revive older screenshots.
  return images.length === 0 || images.some((artifact) => captureMatchesMode(artifact, mobileMode))
}

export function captureFiles(files: PlaywrightFile[]) {
  return files.filter((file) => file.purpose === "capture")
}

export async function reviewContent(api: Api, id: string, signal: AbortSignal) {
  try {
    return await api.reviewContent(id, signal)
  } catch {
    // Keep failed reads reachable so their panels can show diagnostics.
    return { preview: true, unit: true, tests: true, log: true, environment: true }
  }
}
