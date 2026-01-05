// WebSocket server for real-time features
import { WebSocketServer, WebSocket } from "ws"
import { createServer, IncomingMessage, ServerResponse } from "http"
import { parse } from "url"

// Types for WebSocket messages
export type WSMessage =
  | { type: "token"; delta: string }
  | { type: "done" }
  | { type: "typing"; userId: string; isTyping: boolean }
  | { type: "error"; message: string }

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Handle HTTP requests for broadcasting
  const { pathname } = parse(req.url || "", true)

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  if (pathname === "/broadcast" && req.method === "POST") {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      try {
        const { roomId, message } = JSON.parse(body)
        if (!roomId || !message) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "roomId and message required" }))
          return
        }
        broadcast(roomId, message)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: true }))
      } catch (err) {
        console.error("Broadcast error:", err)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON" }))
      }
    })
    return
  }

  // Health check
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }))
    return
  }

  res.writeHead(404)
  res.end("Not found")
})
const wss = new WebSocketServer({ noServer: true })

// Room management
const rooms = new Map<string, Set<WebSocket>>()

// Join a room
function joinRoom(roomId: string, ws: WebSocket) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set())
  }
  rooms.get(roomId)!.add(ws)

  // Clean up when connection closes
  ws.on("close", () => {
    rooms.get(roomId)?.delete(ws)
    // Remove empty rooms
    if (rooms.get(roomId)?.size === 0) {
      rooms.delete(roomId)
    }
  })

  console.log(
    `Client joined room: ${roomId}. Total in room: ${rooms.get(roomId)?.size}`
  )
}

// Broadcast to all clients in a room
function broadcast(roomId: string, data: WSMessage | object | string) {
  const roomClients = rooms.get(roomId)
  if (!roomClients) return

  const message = typeof data === "string" ? data : JSON.stringify(data)

  for (const client of roomClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message)
      } catch (error) {
        console.error("Error sending message to client:", error)
        // Remove failed client
        roomClients.delete(client)
      }
    }
  }
}

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  const { query } = parse(req.url!, true)
  const roomId = String(query.roomId ?? "lobby")

  joinRoom(roomId, ws)

  // Handle incoming messages (if needed for future features)
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString())
      console.log("Received message:", message)
      // Handle different message types here if needed
    } catch (error) {
      console.error("Invalid message format:", error)
    }
  })

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
  })
})

// HTTP upgrade handler for WebSocket
server.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url!)

  if (pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req)
    })
  } else {
    socket.destroy()
  }
})

// Start the server
const PORT = process.env.WS_PORT || 8787
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}/ws`)
  console.log(`HTTP broadcast endpoint: http://localhost:${PORT}/broadcast`)
})

// Export broadcast function for use from Next.js API routes
export { broadcast }

// Helper function for server-side broadcasting
export function serverBroadcast(roomId: string, payload: WSMessage) {
  broadcast(roomId, payload)
}
