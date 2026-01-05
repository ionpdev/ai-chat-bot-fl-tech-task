"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type RoomStats = {
  userMessages: number
  assistantMessages: number
  avgResponseMs: number
  lastResponseMs: number
  tokenUsage: { total: number }
}

type RoomSettings = {
  roomId: string
  rateLimitMax: number
  rateLimitWindowMs: number
  slowModeMs: number
}

type RoomOverview = {
  roomId: string
  stats: RoomStats
  settings: RoomSettings
}

type Message = {
  id: string
  roomId: string
  content: string
  flags?: string[]
  hidden?: boolean
}

type ModerationLog = {
  id: string
  roomId: string
  action: string
  targetId?: string
  actor?: string
  createdAt: number
  details?: string
}

type AdminOverview = {
  rooms: RoomOverview[]
  flagged: Message[]
  logs: ModerationLog[]
}

const emptyOverview: AdminOverview = {
  rooms: [],
  flagged: [],
  logs: [],
}

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview)
  const [loading, setLoading] = useState(true)
  const [showHidden, setShowHidden] = useState(false)
  const [logRoomFilter, setLogRoomFilter] = useState("all")
  const [logActionFilter, setLogActionFilter] = useState("all")
  const [logActorFilter, setLogActorFilter] = useState("")

  async function loadOverview() {
    try {
      const response = await fetch("/api/admin/overview")
      if (!response.ok) return
      const data = (await response.json()) as AdminOverview
      setOverview(data)
    } catch (err) {
      console.warn("Admin overview error", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [])

  async function updateSettings(roomId: string, settings: RoomSettings) {
    await fetch("/api/admin/room-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, ...settings, actor: "admin" }),
    })
    await loadOverview()
  }

  async function moderateMessage(roomId: string, id: string, action: string) {
    await fetch("/api/admin/moderation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, id, action, actor: "admin" }),
    })
    await loadOverview()
  }

  const filteredFlagged = overview.flagged.filter((message) => {
    if (!showHidden && message.hidden) return false
    return true
  })

  const filteredLogs = overview.logs.filter((log) => {
    if (logRoomFilter !== "all" && log.roomId !== logRoomFilter) return false
    if (logActionFilter !== "all" && log.action !== logActionFilter) return false
    if (
      logActorFilter &&
      !(log.actor ?? "").toLowerCase().includes(logActorFilter.toLowerCase())
    ) {
      return false
    }
    return true
  })

  const uniqueActions = Array.from(
    new Set(overview.logs.map((log) => log.action))
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rooms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          {loading && <p className="text-muted-foreground">Loading…</p>}
          {!loading && overview.rooms.length === 0 && (
            <p className="text-muted-foreground">No rooms yet.</p>
          )}
          {overview.rooms.map((room) => (
            <div
              key={room.roomId}
              className="rounded-lg border border-slate-200/70 bg-white/80 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link
                    href={`/room/${room.roomId}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    #{room.roomId}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">
                    Messages:{" "}
                    {room.stats.userMessages + room.stats.assistantMessages}
                    {" · "}
                    Tokens: {room.stats.tokenUsage.total}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Avg {Math.round(room.stats.avgResponseMs)}ms · Last{" "}
                  {Math.round(room.stats.lastResponseMs)}ms
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                <label className="flex flex-col gap-1">
                  Rate limit max
                  <input
                    type="number"
                    min={1}
                    value={room.settings.rateLimitMax}
                    onChange={(e) =>
                      setOverview((prev) => ({
                        ...prev,
                        rooms: prev.rooms.map((item) =>
                          item.roomId === room.roomId
                            ? {
                                ...item,
                                settings: {
                                  ...item.settings,
                                  rateLimitMax: Number(e.target.value),
                                },
                              }
                            : item
                        ),
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Window ms
                  <input
                    type="number"
                    min={1000}
                    value={room.settings.rateLimitWindowMs}
                    onChange={(e) =>
                      setOverview((prev) => ({
                        ...prev,
                        rooms: prev.rooms.map((item) =>
                          item.roomId === room.roomId
                            ? {
                                ...item,
                                settings: {
                                  ...item.settings,
                                  rateLimitWindowMs: Number(e.target.value),
                                },
                              }
                            : item
                        ),
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Slow mode ms
                  <input
                    type="number"
                    min={0}
                    value={room.settings.slowModeMs}
                    onChange={(e) =>
                      setOverview((prev) => ({
                        ...prev,
                        rooms: prev.rooms.map((item) =>
                          item.roomId === room.roomId
                            ? {
                                ...item,
                                settings: {
                                  ...item.settings,
                                  slowModeMs: Number(e.target.value),
                                },
                              }
                            : item
                        ),
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      updateSettings(room.roomId, room.settings)
                    }
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadOverview}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Flagged Messages</CardTitle>
            <button
              type="button"
              onClick={() => setShowHidden((prev) => !prev)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
            >
              {showHidden ? "Hide hidden" : "Show hidden"}
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          {filteredFlagged.length === 0 && (
            <p className="text-muted-foreground">No flagged messages.</p>
          )}
          {filteredFlagged.slice(0, 30).map((message) => (
            <div
              key={message.id}
              className="rounded-lg border border-rose-200/70 bg-rose-50/60 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700">
                <span>
                  Room{" "}
                  <Link
                    href={`/room/${message.roomId}`}
                    className="font-semibold hover:underline"
                  >
                    #{message.roomId}
                  </Link>
                </span>
                <span>Flags: {(message.flags ?? []).join(", ")}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {message.content}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    moderateMessage(message.roomId, message.id, "resolve")
                  }
                >
                  Resolve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    moderateMessage(message.roomId, message.id, "hide")
                  }
                >
                  Hide
                </Button>
                {message.hidden && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      moderateMessage(message.roomId, message.id, "unhide")
                    }
                  >
                    Unhide
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Moderation Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={logRoomFilter}
              onChange={(e) => setLogRoomFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
            >
              <option value="all">All rooms</option>
              {overview.rooms.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  #{room.roomId}
                </option>
              ))}
            </select>
            <select
              value={logActionFilter}
              onChange={(e) => setLogActionFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
            >
              <option value="all">All actions</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <input
              value={logActorFilter}
              onChange={(e) => setLogActorFilter(e.target.value)}
              placeholder="Filter by actor"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
            />
            {(logRoomFilter !== "all" ||
              logActionFilter !== "all" ||
              logActorFilter) && (
              <button
                type="button"
                onClick={() => {
                  setLogRoomFilter("all")
                  setLogActionFilter("all")
                  setLogActorFilter("")
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
              >
                Clear filters
              </button>
            )}
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              {filteredLogs.length} result{filteredLogs.length === 1 ? "" : "s"}
            </span>
          </div>
          {filteredLogs.length === 0 && (
            <p className="text-muted-foreground">No logs yet.</p>
          )}
          {filteredLogs.slice(0, 30).map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-slate-200/70 bg-white/80 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">
                  {log.action}
                </span>
                <span className="text-slate-400">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-[0.7rem] text-slate-500">
                Room #{log.roomId}
                {log.targetId && ` · Target ${log.targetId}`}
                {log.actor && ` · Actor ${log.actor}`}
              </div>
              {log.details && (
                <div className="mt-1 text-[0.7rem] text-slate-500">
                  {log.details}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
