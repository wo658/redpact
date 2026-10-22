export function gitOutputLimitMiB() {
  const value = process.env.REDPACT_GIT_MAX_BUFFER_MIB
  if (value === undefined) {
    return 128
  }
  const limit = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 2048) {
    throw new Error("REDPACT_GIT_MAX_BUFFER_MIB must be an integer from 1 to 2048")
  }
  return limit
}

export function gitOutputLimit() {
  return gitOutputLimitMiB() * 1024 * 1024
}
