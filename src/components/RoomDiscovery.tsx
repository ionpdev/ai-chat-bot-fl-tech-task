"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RoomDiscoveryProps = {
  popularRooms: string[]
  currentRoom?: string
}

const RECENTS_KEY = "chat_recent_rooms"
const FAVORITES_KEY = "chat_favorite_rooms"

function normalizeRoom(value: string) {
  return value.trim().replace(/^#/, "")
}

function readList(key: string): string[] {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return []
    const parsed = JSON.parse(stored) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.log("Room storage read error", err)
    return []
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.log("Room storage write error", err)
  }
}

export function RoomDiscovery({ popularRooms, currentRoom }: RoomDiscoveryProps) {
  const router = useRouter()
  const [recentRooms, setRecentRooms] = useState<string[]>([])
  const [favoriteRooms, setFavoriteRooms] = useState<string[]>([])
  const [roomInput, setRoomInput] = useState("")
  const normalizedCurrent = currentRoom ? normalizeRoom(currentRoom) : undefined

  useEffect(() => {
    setRecentRooms(readList(RECENTS_KEY))
    setFavoriteRooms(readList(FAVORITES_KEY))
  }, [])

  useEffect(() => {
    if (!normalizedCurrent) return
    const room = normalizedCurrent
    if (!room) return
    setRecentRooms((prev) => {
      const next = [room, ...prev.filter((item) => item !== room)].slice(0, 6)
      writeList(RECENTS_KEY, next)
      return next
    })
  }, [normalizedCurrent])

  const allPopular = useMemo(
    () => Array.from(new Set(popularRooms.map(normalizeRoom))),
    [popularRooms]
  )

  function toggleFavorite(room: string) {
    setFavoriteRooms((prev) => {
      const next = prev.includes(room)
        ? prev.filter((item) => item !== room)
        : [room, ...prev]
      writeList(FAVORITES_KEY, next)
      return next
    })
  }

  function handleJoinRoom() {
    const room = normalizeRoom(roomInput)
    if (!room) return
    router.push(`/room/${room}`)
    setRoomInput("")
  }

  function handleRandomRoom() {
    const room = crypto.randomUUID().slice(0, 8)
    router.push(`/room/${room}`)
  }

  function renderRoomChip(room: string, highlighted?: boolean) {
    const isFavorite = favoriteRooms.includes(room)
    return (
      <div key={room} className="flex items-center gap-2">
        <Link href={`/room/${room}`}>
          <Button
            variant={highlighted ? "default" : "outline"}
            size="sm"
            className="rounded-full"
          >
            #{room}
          </Button>
        </Link>
        <button
          type="button"
          onClick={() => toggleFavorite(room)}
          className={`rounded-full border px-2 py-0.5 text-xs transition ${
            isFavorite
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 text-slate-500 hover:border-slate-300"
          }`}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
    )
  }

  return (
    <Card className="border-slate-200/70 bg-white/80 shadow-sm backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Find a Room</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm text-slate-600">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Jump to room
          </p>
          <div className="flex gap-2">
            <Input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="room name"
              className="rounded-full bg-white/90"
            />
            <Button
              type="button"
              onClick={handleJoinRoom}
              className="rounded-full"
            >
              Join
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleRandomRoom}
              className="rounded-full"
            >
              Random
            </Button>
          </div>
        </div>

        {favoriteRooms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Favorites
            </p>
            <div className="flex flex-wrap gap-2">
              {favoriteRooms.map((room) => renderRoomChip(room))}
            </div>
          </div>
        )}

        {recentRooms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Recent rooms
            </p>
            <div className="flex flex-wrap gap-2">
              {recentRooms.map((room) =>
                renderRoomChip(room, room === normalizedCurrent)
              )}
            </div>
          </div>
        )}

        {allPopular.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Popular rooms
            </p>
            <div className="flex flex-wrap gap-2">
              {allPopular.map((room) =>
                renderRoomChip(room, room === normalizedCurrent)
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
