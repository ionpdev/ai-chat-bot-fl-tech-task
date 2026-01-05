import Chat from "@/components/Chat"
import { listMessages } from "@/lib/db"
import Link from "next/link"

interface RoomPageProps {
  params: Promise<{ roomId: string }>
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params
  const initialMessages = listMessages(roomId).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }))

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
          >
            ← Back to rooms
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Room: {roomId}
          </h1>
          <p className="text-muted-foreground">
            Share this URL to chat with others in this room
          </p>
        </div>

        <Chat roomId={roomId} initialMessages={initialMessages} />
      </div>
    </main>
  )
}
