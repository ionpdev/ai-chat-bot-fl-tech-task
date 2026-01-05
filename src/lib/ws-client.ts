// WebSocket client helper for browser
export type RoomEvent =
  | { type: "token"; delta: string }
  | { type: "done" }
  | { type: "typing"; userId: string; isTyping: boolean }
  | { type: "error"; message: string }
  | { type: "user-message"; id: string; content: string; senderId: string }

export function connect(roomId: string, onEvent: (event: RoomEvent) => void) {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8787/ws"
  const url = `${wsUrl}?roomId=${encodeURIComponent(roomId)}`

  let ws: WebSocket | null = null
  let shouldReconnect = true
  let reconnectDelay = 1000
  let reconnectTimer: number | undefined
  let isIntentionalClose = false

  function createWebSocket() {
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.log(`Connected to room: ${roomId}`)
      // reset backoff on successful connect
      reconnectDelay = 1000
      isIntentionalClose = false
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RoomEvent
        onEvent(data)
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error)
      }
    }

    ws.onclose = () => {
      if (!isIntentionalClose) {
        console.log(`Disconnected from room: ${roomId}`)
      }
      if (shouldReconnect && !isIntentionalClose) {
        // Exponential backoff reconnect
        reconnectTimer = window.setTimeout(() => {
          createWebSocket()
        }, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
      }
    }

    ws.onerror = () => {
      // Only log errors if not an intentional close
      // WebSocket errors during close are expected and noisy
      if (!isIntentionalClose && shouldReconnect) {
        console.warn(
          `WebSocket connection issue for room: ${roomId} - will retry`
        )
      }
    }
  }

  // Start initial connection
  createWebSocket()

  // Return cleanup function
  return () => {
    shouldReconnect = false
    isIntentionalClose = true
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
    }
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close()
    }
  }
}
