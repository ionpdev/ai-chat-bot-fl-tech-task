import Chat from "@/components/Chat"
import { listMessages } from "@/lib/db"

export default async function Home() {
  const roomId = "lobby"
  const initialMessages = listMessages(roomId).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }))

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

        <Chat roomId={roomId} initialMessages={initialMessages} />
      </div>
    </main>
  )
}
