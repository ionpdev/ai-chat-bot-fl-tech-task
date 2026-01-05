import { NextRequest } from "next/server"
import { addModerationLog, resolveFlags, updateMessage } from "@/lib/db"

const BROADCAST_URL =
  process.env.WS_BROADCAST_URL ?? "http://localhost:8787/broadcast"

async function broadcastToRoom(roomId: string, message: object) {
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

export async function PATCH(req: NextRequest) {
  try {
    const { roomId, id, action, actor } = await req.json()
    if (!roomId || !id || !action) {
      return new Response("roomId, id, and action are required", { status: 400 })
    }

    let updated
    if (action === "resolve") {
      updated = resolveFlags(id)
    } else if (action === "hide") {
      updated = updateMessage(id, { hidden: true })
    } else if (action === "unhide") {
      updated = updateMessage(id, { hidden: false })
    } else {
      return new Response("Unknown action", { status: 400 })
    }

    if (!updated) {
      return new Response("Message not found", { status: 404 })
    }

    await broadcastToRoom(roomId, { type: "message-updated", message: updated })

    addModerationLog({
      roomId,
      action: `moderation.${action}`,
      actor,
      targetId: id,
    })

    return Response.json({ success: true, message: updated })
  } catch (error) {
    console.error("Moderation error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
