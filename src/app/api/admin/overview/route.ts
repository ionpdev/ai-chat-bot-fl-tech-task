import { NextRequest } from "next/server"
import {
  getRoomSettings,
  getRoomStats,
  listAllMessages,
  listModerationLogs,
  listRooms,
} from "@/lib/db"

export async function GET(_req: NextRequest) {
  const rooms = listRooms()
  const roomData = rooms.map((roomId) => ({
    roomId,
    stats: getRoomStats(roomId),
    settings: getRoomSettings(roomId),
  }))
  const messages = listAllMessages()
  const flagged = messages.filter((message) => (message.flags ?? []).length > 0)

  return Response.json({
    rooms: roomData,
    flagged,
    logs: listModerationLogs(),
  })
}
