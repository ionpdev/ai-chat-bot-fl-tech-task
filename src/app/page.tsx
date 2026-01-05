import Chat from "@/components/Chat"
import { listMessages } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function Home() {
  const roomId = "lobby"
  const initialMessages = listMessages(roomId).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }))

  // Example rooms - in production, these would come from a database
  const popularRooms = ["lobby", "general", "random", "tech", "help"]

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Full-Stack AI Chat
          </h1>
          <p className="text-muted-foreground">
            Real-time AI chat with streaming responses and live updates
          </p>
        </div>

        {/* Room selector */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Join a Room</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {popularRooms.map((room) => (
                <Link key={room} href={`/room/${room}`}>
                  <Button
                    variant={room === "lobby" ? "default" : "outline"}
                    size="sm"
                  >
                    #{room}
                  </Button>
                </Link>
              ))}
              <Link href={`/room/${crypto.randomUUID().slice(0, 8)}`}>
                <Button variant="ghost" size="sm">
                  + Create new room
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Default lobby chat */}
        <Chat roomId={roomId} initialMessages={initialMessages} />
      </div>
    </main>
  )
}
