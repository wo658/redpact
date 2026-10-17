type ComposeHandle = {
  down(options: { removeVolumes: boolean; timeout: number }): Promise<unknown>
}
type NetworkHandle = { stop(): Promise<unknown> }

export function createComposeLifecycle() {
  let environment: ComposeHandle | undefined
  let network: NetworkHandle | undefined
  return {
    network(value: NetworkHandle) {
      network = value
    },
    environment(value: ComposeHandle) {
      environment = value
    },
    async stop() {
      if (environment) {
        await environment.down({ removeVolumes: true, timeout: 10_000 })
        environment = undefined
      }
      if (network) {
        await network.stop()
        network = undefined
      }
    },
  }
}
