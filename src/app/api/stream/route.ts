import { NextRequest } from "next/server"
import { streamRoomReply } from "@/app/actions"

export async function POST(req: NextRequest) {
  try {
    const { roomId, messages, senderId } = await req.json()

    if (!roomId || !messages || !Array.isArray(messages)) {
      return new Response("Invalid request body", { status: 400 })
    }

    return streamRoomReply(roomId, messages, senderId)
  } catch (error) {
    console.error("Stream API error:", error)
    // In development, return the error message to help debugging.
    const isDev = process.env.NODE_ENV !== "production"
    const body = isDev
      ? `Stream API error: ${String(
          (error && (error as any).message) ?? error
        )}`
      : "Internal server error"
    return new Response(body, { status: 500 })
  }
}
