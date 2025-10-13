// WebSocket client helper for browser
export type RoomEvent =
  | { type: "token"; delta: string }
  | { type: "done" }
  | { type: "typing"; userId: string; isTyping: boolean }
  | { type: "error"; message: string }

export function connect(roomId: string, onEvent: (event: RoomEvent) => void) {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8787/ws"
  const url = `${wsUrl}?roomId=${encodeURIComponent(roomId)}`

  const ws = new WebSocket(url)

  ws.onopen = () => {
    console.log(`Connected to room: ${roomId}`)
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
    console.log(`Disconnected from room: ${roomId}`)
  }

  ws.onerror = (error) => {
    console.error("WebSocket error:", error)
  }

  // Return cleanup function
  return () => {
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close()
    }
  }
}
