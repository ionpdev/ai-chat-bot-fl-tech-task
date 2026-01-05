import Chat from "@/components/Chat"
import { listMessages } from "@/lib/db"
import Link from "next/link"
import { RoomDiscovery } from "@/components/RoomDiscovery"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Suspense } from "react"

interface RoomPageProps {
  params: Promise<{ roomId: string }>
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params
  const initialMessages = listMessages(roomId).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    senderId: m.senderId,
    pinned: m.pinned,
    reactions: m.reactions,
    attachments: m.attachments,
    flags: m.flags,
    hidden: m.hidden,
  }))
  const popularRooms = ["lobby", "general", "random", "tech", "help"]

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(248,250,252,1),_rgba(226,232,240,0.7),_rgba(241,245,249,1))] p-4 md:p-8">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(14,116,144,0.2),_transparent_70%)] blur-2xl" />

      <div className="container relative mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to rooms
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Room: {roomId}
          </h1>
          <p className="text-muted-foreground">
            Share this URL to chat with others in this room
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Suspense fallback={<div>Loading chat...</div>}>
              <Chat roomId={roomId} initialMessages={initialMessages} />
            </Suspense>
          </div>

          <aside className="space-y-6">
            <RoomDiscovery popularRooms={popularRooms} currentRoom={roomId} />
            <Card className="border-slate-200/70 bg-white/80 shadow-sm backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Share this room</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Copy the room link to bring others into the conversation.
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  )
}
