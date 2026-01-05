import { NextRequest } from "next/server"
import { getRoomStats } from "@/lib/db"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomId = searchParams.get("roomId")
  if (!roomId) {
    return new Response("roomId is required", { status: 400 })
  }

  const stats = getRoomStats(roomId)
  return Response.json({ stats })
}
