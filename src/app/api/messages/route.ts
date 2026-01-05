import { NextRequest } from "next/server"
import {
  deleteMessage,
  flagMessage,
  resolveFlags,
  toggleReaction,
  updateMessage,
} from "@/lib/db"

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
    const { roomId, id, content, pinned, hidden, reaction, userId, flag, resolve } =
      await req.json()

    if (!roomId || !id) {
      return new Response("roomId and id are required", { status: 400 })
    }

    let updated

    if (typeof content === "string") {
      updated = updateMessage(id, { content })
    } else if (typeof pinned === "boolean") {
      updated = updateMessage(id, { pinned })
    } else if (typeof hidden === "boolean") {
      updated = updateMessage(id, { hidden })
    } else if (reaction && userId) {
      updated = toggleReaction(id, reaction, userId)
    } else if (typeof flag === "string") {
      updated = flagMessage(id, flag)
    } else if (resolve) {
      updated = resolveFlags(id)
    } else {
      return new Response("No valid update provided", { status: 400 })
    }

    if (!updated) {
      return new Response("Message not found", { status: 404 })
    }

    await broadcastToRoom(roomId, { type: "message-updated", message: updated })
    return Response.json({ success: true, message: updated })
  } catch (error) {
    console.error("Message update error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { roomId, id } = await req.json()
    if (!roomId || !id) {
      return new Response("roomId and id are required", { status: 400 })
    }

    const success = deleteMessage(id)
    if (!success) {
      return new Response("Message not found", { status: 404 })
    }

    await broadcastToRoom(roomId, { type: "message-deleted", id })
    return Response.json({ success: true })
  } catch (error) {
    console.error("Message delete error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
