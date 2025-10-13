import { NextRequest } from "next/server"
import { streamRoomReply } from "@/app/actions"

export async function POST(req: NextRequest) {
  try {
    const { roomId, messages } = await req.json()

    if (!roomId || !messages || !Array.isArray(messages)) {
      return new Response("Invalid request body", { status: 400 })
    }

    return streamRoomReply(roomId, messages)
  } catch (error) {
    console.error("Stream API error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
