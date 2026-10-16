export function networkDiagnostic(message: string): string {
  if (
    /address pools?.*(?:fully subnetted|exhaust)|could not find an available.*address pool/i.test(
      message,
    )
  ) {
    return `${message}\nDocker address allocation exhausted. Inspect retained Redpact environments and retry Stop for owned resources first. Check Docker default-address-pools, per-network subnet size and host/VPN routes separately; this error alone does not establish a resource leak. Do not globally prune networks.`
  }
  if (/pool overlaps|overlapping.*(?:pool|subnet)/i.test(message)) {
    return `${message}\nDocker rejected an overlapping subnet. Check authored IPAM, existing networks and host/VPN routes; increasing address pools does not resolve an overlap. Preserve unrelated networks.`
  }
  return message
}
