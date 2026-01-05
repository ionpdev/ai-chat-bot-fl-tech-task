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
  const [clientId, setClientId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const debounceRef = useRef<number | undefined>(undefined)
  const streamingAccumulator = useRef("")
  const wsDoneRef = useRef(false)
  const clientIdRef = useRef<string | null>(null)

  // Keep clientIdRef in sync with clientId state
  useEffect(() => {
    clientIdRef.current = clientId
  }, [clientId])

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
          wsDoneRef.current = true
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

        case "user-message":
          // Add message from other users (skip if it's from this client)
          if (event.senderId !== clientIdRef.current) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === event.id)) return prev
              return [
                ...prev,
                {
                  id: event.id,
                  role: "user",
                  content: event.content,
                },
              ]
            })
            // Another user sent a message, so AI will respond
            setIsLoading(true)
            streamingAccumulator.current = ""
            wsDoneRef.current = false
          }
          break
      }
    })

    return cleanup
  }, [roomId]) // Removed clientId dependency - use ref instead

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }

    const outbound = [...messages, userMessage]
    setMessages(outbound)
    setInput("")
    setIsLoading(true)
    streamingAccumulator.current = ""
    wsDoneRef.current = false

    try {
      const response = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          messages: outbound,
          senderId: clientId,
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => "")
        throw new Error(text || "Failed to send message")
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
          // Only update streaming state from HTTP if WS hasn't delivered tokens
          if (!streamingAccumulator.current) {
            setStreaming(localStreaming)
          }
        }
      }

      // HTTP-stream fallback: if we received text over HTTP but WS did not
      if (localStreaming && !wsDoneRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: localStreaming,
          },
        ])
        setStreaming("")
        setIsLoading(false)
      }
    } catch (err) {
      console.error("Error sending message:", err)
      setError(err instanceof Error ? err.message : String(err))
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
        userId: clientId ?? "anonymous",
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
          userId: clientId ?? "anonymous",
          isTyping: false,
        }),
      }).catch(console.error)
    }, 500)
  }

  // Generate a unique client id per tab/session for message deduplication
  // Use sessionStorage so each tab gets its own ID (localStorage is shared across tabs)
  useEffect(() => {
    try {
      const key = "chat_session_id"
      let id = sessionStorage.getItem(key)
      if (!id) {
        id = crypto.randomUUID()
        sessionStorage.setItem(key, id)
      }
      setClientId(id)
    } catch (e) {
      // sessionStorage may be unavailable in some environments
      console.log("Error", e)
      setClientId(crypto.randomUUID())
    }
  }, [])

  // Clear typing timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

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

        {error && (
          <div className="text-sm text-destructive">Error: {error}</div>
        )}

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
