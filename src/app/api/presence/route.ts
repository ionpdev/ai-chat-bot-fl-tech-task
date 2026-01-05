import { NextRequest } from "next/server"
import { cleanupInactiveUsers, getUsersInRoom, updateUser } from "@/lib/db"

const BROADCAST_URL = process.env.WS_BROADCAST_URL ?? ""

async function broadcastToRoom(roomId: string, message: object) {
  if (!BROADCAST_URL) return
  try {
    await fetch(BROADCAST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, message }),
    })
  } catch (err) {
    console.error("Failed to broadcast to room:", err)
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomId = searchParams.get("roomId")
  if (!roomId) {
    return new Response("roomId is required", { status: 400 })
  }

  cleanupInactiveUsers()
  const users = getUsersInRoom(roomId)
  return Response.json({ users })
}

export async function POST(req: NextRequest) {
  try {
    const { roomId, userId, name } = await req.json()

    if (!roomId || !userId) {
      return new Response("roomId and userId are required", { status: 400 })
    }

    updateUser({
      id: userId,
      roomId,
      name: typeof name === "string" ? name : undefined,
    })

    cleanupInactiveUsers()
    const users = getUsersInRoom(roomId)
    await broadcastToRoom(roomId, { type: "presence", users })

    return Response.json({ success: true, users })
  } catch (error) {
    console.error("Presence API error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
