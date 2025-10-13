import { NextRequest, NextResponse } from "next/server"
import WebSocket from "ws"
import { env } from "@/lib/env"

export async function POST(req: NextRequest) {
  try {
    const { roomId, userId, isTyping } = await req.json()

    if (!roomId || !userId || typeof isTyping !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields: roomId, userId, isTyping" },
        { status: 400 }
      )
    }

    // Broadcast typing status via WebSocket
    const ws = new WebSocket(
      `${env.WS_URL}?roomId=${encodeURIComponent(roomId)}`
    )

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "typing",
          userId,
          isTyping,
        })
      )
      ws.close()
    })

    ws.on("error", (error) => {
      console.error("Typing API WebSocket error:", error)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Typing API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
