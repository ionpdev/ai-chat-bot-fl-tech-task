"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { MessageList } from "./MessageList"
import { connect, type RoomEvent } from "@/lib/ws-client"
import { asc } from "@/utils/sortStrings"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

interface ChatProps {
  roomId: string
  initialMessages: Message[]
}

export default function Chat({ roomId, initialMessages }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState("")
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const debounceRef = useRef<number | undefined>(undefined)
  const streamingAccumulator = useRef("")

  // WebSocket connection for real-time updates
  useEffect(() => {
    const cleanup = connect(roomId, (event: RoomEvent) => {
      switch (event.type) {
        case "token":
          streamingAccumulator.current += event.delta
          setStreaming(streamingAccumulator.current)
          break

        case "done":
          if (streamingAccumulator.current) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: streamingAccumulator.current,
              },
            ])
            streamingAccumulator.current = ""
            setStreaming("")
          }
          setIsLoading(false)
          break

        case "typing":
          setTypingUsers((prev) => {
            const next = event.isTyping
              ? Array.from(new Set([...prev, event.userId]))
              : prev.filter((id) => id !== event.userId)
            return next.sort(asc((x) => x))
          })
          break
      }
    })

    return cleanup
  }, [roomId])

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    streamingAccumulator.current = ""

    try {
      const response = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          messages: [...messages, userMessage],
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }

      // Read the streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let localStreaming = ""

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          localStreaming += decoder.decode(value, { stream: true })
          setStreaming(localStreaming)
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      setIsLoading(false)
    }
  }

  // Handle typing indicators
  function handleInputChange(value: string) {
    setInput(value)

    // Send typing indicator
    fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        userId: "anonymous",
        isTyping: true,
      }),
    }).catch(console.error)

    // Clear previous timeout and set new one
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      fetch("/api/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          userId: "anonymous",
          isTyping: false,
        }),
      }).catch(console.error)
    }, 500)
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>AI Chat - Room: {roomId}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {typingUsers.length > 0 && (
              <span className="italic">{typingUsers.join(", ")} typing...</span>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <MessageList
          messages={messages}
          streamingContent={streaming || undefined}
        />

        <Separator />

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isLoading}>
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
