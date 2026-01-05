import { NextRequest } from "next/server"
import { addModerationLog, updateRoomSettings } from "@/lib/db"

export async function PATCH(req: NextRequest) {
  try {
    const { roomId, rateLimitMax, rateLimitWindowMs, slowModeMs, actor } =
      await req.json()

    if (!roomId) {
      return new Response("roomId is required", { status: 400 })
    }

    const updated = updateRoomSettings(roomId, {
      rateLimitMax: Number.isFinite(rateLimitMax)
        ? Math.max(1, Number(rateLimitMax))
        : undefined,
      rateLimitWindowMs: Number.isFinite(rateLimitWindowMs)
        ? Math.max(1000, Number(rateLimitWindowMs))
        : undefined,
      slowModeMs: Number.isFinite(slowModeMs)
        ? Math.max(0, Number(slowModeMs))
        : undefined,
    })

    addModerationLog({
      roomId,
      action: "settings.update",
      actor,
      details: JSON.stringify({
        rateLimitMax,
        rateLimitWindowMs,
        slowModeMs,
      }),
    })

    return Response.json({ success: true, settings: updated })
  } catch (error) {
    console.error("Room settings error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
