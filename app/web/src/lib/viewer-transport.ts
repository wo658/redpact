export interface ViewerEvents {
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  addEventListener: (type: string, listener: () => void) => void
  close: () => void
}
export interface ViewerTransport {
  fetch: typeof fetch
  events: (path: string) => ViewerEvents
}
let transport: ViewerTransport | undefined
export function setViewerTransport(value: ViewerTransport) {
  transport = value
}
export function hasViewerTransport() {
  return Boolean(transport)
}
export const viewerFetch: typeof fetch = (input, init) => (transport?.fetch ?? fetch)(input, init)
export function viewerEvents(path: string): ViewerEvents {
  return transport ? transport.events(path) : new window.EventSource(path)
}
