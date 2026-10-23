const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function parseVersion(version) {
  if (!stableVersion.test(version)) {
    throw new Error(`Expected a stable semantic version: ${version}`)
  }
  const parts = version.split(".").map(Number)
  if (!parts.every(Number.isSafeInteger)) {
    throw new Error(`Expected a safe stable semantic version: ${version}`)
  }
  return parts
}

function compare(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }
  return 0
}

export function selectReleaseVersion(current, tags) {
  const candidate = parseVersion(current)
  const versions = tags
    .filter((tag) => /^v/.test(tag) && stableVersion.test(tag.slice(1)))
    .map((tag) => parseVersion(tag.slice(1)))
    .sort(compare)
  const latest = versions.at(-1)
  if (!latest || compare(candidate, latest) > 0) {
    return current
  }
  latest[2] += 1
  const next = latest.join(".")
  parseVersion(next)
  return next
}
