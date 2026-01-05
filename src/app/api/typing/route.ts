import { NextRequest, NextResponse } from "next/server"
import { updateUser } from "@/lib/db"

// Broadcast URL for the standalone WS server
const BROADCAST_URL = process.env.WS_BROADCAST_URL ?? ""

/**
 * Typing indicator endpoint.
 * Broadcasts typing status to the room via the WS server's HTTP endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, userId, isTyping } = await req.json()

    if (!roomId || !userId || typeof isTyping !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields: roomId, userId, isTyping" },
        { status: 400 }
      )
    }

    updateUser({ id: userId, roomId, isTyping })

    // Broadcast typing status via WS server's HTTP endpoint
    if (BROADCAST_URL) {
      try {
        await fetch(BROADCAST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            message: { type: "typing", userId, isTyping },
          }),
        })
      } catch (broadcastErr) {
        console.error("Failed to broadcast typing:", broadcastErr)
        // Don't fail the request if broadcast fails
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Typing API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
