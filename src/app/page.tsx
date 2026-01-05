import Chat from "@/components/Chat"
import { listMessages } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RoomDiscovery } from "@/components/RoomDiscovery"

export default async function Home() {
  const roomId = "lobby"
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

  // Example rooms - in production, these would come from a database
  const popularRooms = ["lobby", "general", "random", "tech", "help"]

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(248,250,252,1),_rgba(226,232,240,0.7),_rgba(241,245,249,1))] p-4 md:p-8">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(14,116,144,0.2),_transparent_70%)] blur-2xl" />

      <div className="container relative mx-auto max-w-6xl">
        <header className="mb-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                Real-time chat for teams and communities.
              </h1>
              <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
                Streaming replies, typing indicators, and room-aware context for
                conversations that move quickly.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {["Streaming", "Live rooms", "Presence"].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Chat roomId={roomId} initialMessages={initialMessages} />
          </div>

          <aside className="space-y-6">
            <RoomDiscovery popularRooms={popularRooms} currentRoom={roomId} />

            <Card className="border-slate-200/70 bg-white/80 shadow-sm backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Conversation Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2">
                  Ask open-ended questions to keep the AI in creative mode.
                </div>
                <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2">
                  Use room names to anchor topics for your team.
                </div>
                <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2">
                  Multi-line prompts work great for specs and drafts.
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  )
}
