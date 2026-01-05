"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
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
  createdAt?: number
  updatedAt?: number
  senderId?: string
  pinned?: boolean
  reactions?: Record<string, string[]>
  attachments?: Attachment[]
  flags?: string[]
  hidden?: boolean
  status?: "pending" | "sent" | "error"
  localOnly?: boolean
}

type PresenceUser = {
  id: string
  name?: string
  lastSeen: number
  isTyping?: boolean
}

type Attachment = {
  id: string
  name: string
  type: "image" | "pdf"
  url: string
  size: number
  previewText?: string
  previewError?: string
}

type RoomStats = {
  userMessages: number
  assistantMessages: number
  avgResponseMs: number
  lastResponseMs: number
  totalResponses: number
  tokenUsage: {
    prompt: number
    completion: number
    total: number
  }
}

interface ChatProps {
  roomId: string
  initialMessages: Message[]
}

export default function Chat({ roomId, initialMessages }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>(() =>
    initialMessages.map((message) => ({
      ...message,
      status: message.status ?? "sent",
    }))
  )
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState("")
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchRole, setSearchRole] = useState<"all" | "user" | "assistant">(
    "all"
  )
  const [searchRange, setSearchRange] = useState<"all" | "24h" | "7d">("all")
  const [hideFlagged, setHideFlagged] = useState(true)
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([])
  const [displayName, setDisplayName] = useState("")
  const [exportOpen, setExportOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [analytics, setAnalytics] = useState<RoomStats | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const debounceRef = useRef<number | undefined>(undefined)
  const streamingAccumulator = useRef("")
  const wsDoneRef = useRef(false)
  const clientIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftKey = `chat_draft_${roomId}`
  const reactionOptions = ["👍", "❤️", "😂", "👀", "✨"]

  // Keep clientIdRef in sync with clientId state
  useEffect(() => {
    clientIdRef.current = clientId
  }, [clientId])

  function persistDraft(value: string) {
    try {
      localStorage.setItem(draftKey, value)
    } catch (err) {
      console.log("Draft save error", err)
    }
  }

  // WebSocket connection for real-time updates
  useEffect(() => {
    const cleanup = connect(roomId, (event: RoomEvent) => {
      switch (event.type) {
        case "token":
          if (stopRequestedRef.current) return
          streamingAccumulator.current += event.delta
          setStreaming(streamingAccumulator.current)
          break

        case "assistant-message":
          if (stopRequestedRef.current) return
          setMessages((prev) => [
            ...prev,
            {
              id: event.id,
              role: "assistant",
              content: event.content,
              createdAt: Date.now(),
              senderId: "assistant",
              status: "sent",
            },
          ])
          streamingAccumulator.current = ""
          setStreaming("")
          wsDoneRef.current = true
          setIsLoading(false)
          break

        case "done":
          if (stopRequestedRef.current) return
          if (streamingAccumulator.current) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: streamingAccumulator.current,
                createdAt: Date.now(),
                senderId: "assistant",
                status: "sent",
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
                  createdAt: Date.now(),
                  senderId: event.senderId,
                  status: "sent",
                  attachments: event.attachments as Attachment[] | undefined,
                  flags: event.flags as string[] | undefined,
                },
              ]
            })
            // Another user sent a message, so AI will respond
            setIsLoading(true)
            streamingAccumulator.current = ""
            wsDoneRef.current = false
          }
          break

        case "message-updated":
          setMessages((prev) =>
            prev.map((message) =>
              message.id === event.message.id
                ? { ...message, ...event.message }
                : message
            )
          )
          break

        case "message-deleted":
          setMessages((prev) =>
            prev.filter((message) => message.id !== event.id)
          )
          break

        case "presence":
          setPresenceUsers(event.users as PresenceUser[])
          break
      }
    })

    return cleanup
  }, [roomId]) // Removed clientId dependency - use ref instead

  async function sendMessages(
    outbound: Message[],
    newAttachments?: Attachment[]
  ) {
    setIsLoading(true)
    streamingAccumulator.current = ""
    setStreaming("")
    wsDoneRef.current = false
    stopRequestedRef.current = false
    setError(null)

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const outboundForServer = outbound.filter((message) => !message.localOnly)
      const lastUserMessage = [...outboundForServer]
        .reverse()
        .find((message) => message.role === "user")

      const response = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          messages: outboundForServer.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          senderId: clientId,
          clientMessageId: lastUserMessage?.id,
          attachments: newAttachments,
        }),
        signal: abortRef.current.signal,
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
          if (done || stopRequestedRef.current) break

          localStreaming += decoder.decode(value, { stream: true })
          // Only update streaming state from HTTP if WS hasn't delivered tokens
          if (!streamingAccumulator.current) {
            setStreaming(localStreaming)
          }
        }
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === lastUserMessage?.id
            ? { ...message, status: "sent" }
            : message
        )
      )

      // HTTP-stream fallback: if we received text over HTTP but WS did not
      if (localStreaming && !wsDoneRef.current && !stopRequestedRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: localStreaming,
            createdAt: Date.now(),
            senderId: "assistant",
            status: "sent",
          },
        ])
        setStreaming("")
        setIsLoading(false)
      }
    } catch (err) {
      if (stopRequestedRef.current) return
      console.error("Error sending message:", err)
      setError(err instanceof Error ? err.message : String(err))
      setMessages((prev) => {
        const lastUserMessage = [...prev]
          .reverse()
          .find(
            (message) => message.role === "user" && message.status === "pending"
          )
        if (!lastUserMessage) return prev
        return prev.map((message) =>
          message.id === lastUserMessage.id
            ? { ...message, status: "error" }
            : message
        )
      })
      setIsLoading(false)
    }
  }

  function addLocalMessage(content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        createdAt: Date.now(),
        senderId: "assistant",
        status: "sent",
        localOnly: true,
      },
    ])
  }

  function handleSlashCommand(command: string) {
    const [base, ...rest] = command.slice(1).split(" ")
    const argument = rest.join(" ").trim()

    switch (base.toLowerCase()) {
      case "help":
        addLocalMessage(
          "Commands: /help, /clear, /regenerate, /stop, /search <query>"
        )
        return true
      case "clear":
        setMessages([])
        setStreaming("")
        setError(null)
        setSearchQuery("")
        setAttachments([])
        addLocalMessage("Local view cleared. Reload to restore history.")
        return true
      case "regenerate":
        void handleRegenerate()
        return true
      case "stop":
        handleStop()
        return true
      case "search":
        setSearchQuery(argument)
        return true
      default:
        addLocalMessage("Unknown command. Try /help.")
        return true
    }
  }

  // Handle form submission
  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || isLoading || isReadOnly) return

    const trimmed = input.trim()
    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed)
      setInput("")
      persistDraft("")
      return
    }

    const localFlags = detectFlags(trimmed)

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
      senderId: clientId ?? "anonymous",
      status: "pending",
      attachments: attachments.length > 0 ? attachments : undefined,
      flags: localFlags.length > 0 ? localFlags : undefined,
    }

    const outbound = [...messages, userMessage]
    setMessages(outbound)
    setInput("")
    persistDraft("")
    setAttachments([])
    await sendMessages(outbound, userMessage.attachments)
  }

  // Handle typing indicators
  function handleInputChange(value: string) {
    setInput(value)
    persistDraft(value)

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

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  async function handleAttachmentChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    const maxBytes = 5 * 1024 * 1024
    const totalSize =
      attachments.reduce((sum, item) => sum + item.size, 0) +
      files.reduce((sum, file) => sum + file.size, 0)

    if (totalSize > maxBytes) {
      setError("Attachments exceed 5MB total. Please remove some files.")
      return
    }

    const nextAttachments: Attachment[] = []
    for (const file of files) {
      const isImage = file.type.startsWith("image/")
      const isPdf = file.type === "application/pdf"
      if (!isImage && !isPdf) continue

      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })

      let previewText: string | undefined
      let previewError: string | undefined
      if (isPdf) {
        try {
          previewText = await extractPdfPreview(file)
          if (!previewText) {
            previewError = "No text found"
          }
        } catch {
          previewError = "Preview failed"
        }
      }

      nextAttachments.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: isImage ? "image" : "pdf",
        url,
        size: file.size,
        previewText,
        previewError,
      })
    }

    setAttachments((prev) => [...prev, ...nextAttachments])
    event.target.value = ""
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  async function extractPdfPreview(file: File) {
    const buffer = await file.arrayBuffer()
    const loadingTask = pdfjs.getDocument({
      data: buffer,
      // pdfjs types don't expose this flag; cast to allow disabling worker.
    } as unknown as { data: ArrayBuffer; disableWorker: boolean })
    const pdf = await loadingTask.promise
    const maxPages = Math.min(pdf.numPages, 3)
    const chunks: string[] = []

    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const items = textContent.items as Array<{ str?: string }>
      const pageText = items.map((item) => item.str ?? "").join(" ")
      chunks.push(pageText)
    }

    return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 240)
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

  useEffect(() => {
    if (!clientId) return
    try {
      const storedName = localStorage.getItem("chat_display_name")
      if (storedName) {
        setDisplayName(storedName)
      } else {
        setDisplayName(`User ${clientId.slice(0, 4)}`)
      }
    } catch (err) {
      console.log("Display name load error", err)
      setDisplayName(`User ${clientId.slice(0, 4)}`)
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let isMounted = true

    async function refreshPresence() {
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            userId: clientId,
            name: displayName,
          }),
        })
        if (!response.ok) return
        const data = await response.json()
        if (isMounted && Array.isArray(data.users)) {
          setPresenceUsers(data.users)
        }
      } catch (err) {
        console.warn("Presence update failed", err)
      }
    }

    async function loadPresence() {
      try {
        const response = await fetch(`/api/presence?roomId=${roomId}`)
        if (!response.ok) return
        const data = await response.json()
        if (isMounted && Array.isArray(data.users)) {
          setPresenceUsers(data.users)
        }
      } catch (err) {
        console.warn("Presence load failed", err)
      }
    }

    loadPresence()
    refreshPresence()
    const interval = window.setInterval(refreshPresence, 10000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [clientId, displayName, roomId])

  useEffect(() => {
    let isMounted = true

    async function loadAnalytics() {
      try {
        const response = await fetch(`/api/analytics?roomId=${roomId}`)
        if (!response.ok) return
        const data = await response.json()
        if (isMounted && data.stats) {
          setAnalytics(data.stats as RoomStats)
        }
      } catch (err) {
        console.warn("Analytics load failed", err)
      }
    }

    loadAnalytics()
    const interval = window.setInterval(loadAnalytics, 15000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [roomId])

  useEffect(() => {
    try {
      const storedDraft = localStorage.getItem(draftKey)
      if (storedDraft) {
        setInput(storedDraft)
      }
    } catch (err) {
      console.log("Draft load error", err)
    }
  }, [draftKey])

  // Clear typing timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  const handleStop = useCallback(() => {
    if (!isLoading) return
    stopRequestedRef.current = true
    abortRef.current?.abort()
    abortRef.current = null

    const partial = streamingAccumulator.current || (streaming ? streaming : "")
    if (partial) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: partial,
          createdAt: Date.now(),
          senderId: "assistant",
          status: "sent",
        },
      ])
    }

    streamingAccumulator.current = ""
    setStreaming("")
    setIsLoading(false)
  }, [isLoading, streaming])

  async function handleRegenerate() {
    if (isLoading) return
    const lastUserIndex = [...messages]
      .map((message) => message.role)
      .lastIndexOf("user")
    if (lastUserIndex === -1) return

    const outbound = messages.slice(0, lastUserIndex + 1)
    setMessages(outbound)
    await sendMessages(outbound)
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredMessages = messages.filter((message) => {
    if (hideFlagged && (message.flags?.length ?? 0) > 0) return false
    if (message.hidden) return false
    if (searchRole !== "all" && message.role !== searchRole) return false

    if (searchRange !== "all" && message.createdAt) {
      const diff = Date.now() - message.createdAt
      if (searchRange === "24h" && diff > 24 * 60 * 60 * 1000) return false
      if (searchRange === "7d" && diff > 7 * 24 * 60 * 60 * 1000) return false
    }

    if (!normalizedSearch) return true
    const contentMatch = message.content
      .toLowerCase()
      .includes(normalizedSearch)
    const attachmentMatch =
      message.attachments?.some((attachment) =>
        attachment.name.toLowerCase().includes(normalizedSearch)
      ) ?? false
    return contentMatch || attachmentMatch
  })
  const showStreaming =
    searchRole === "all" &&
    searchRange === "all" &&
    (!normalizedSearch || streaming.toLowerCase().includes(normalizedSearch))

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (event.key === "Escape") {
        if (isLoading) {
          handleStop()
          return
        }
        if (searchQuery) {
          setSearchQuery("")
          return
        }
        messageInputRef.current?.blur()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleStop, isLoading, searchQuery])

  const searchParamsString = searchParams.toString()

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString)
    const paramsValue = params.get("q") ?? ""
    const roleParam = params.get("role") ?? "all"
    const rangeParam = params.get("range") ?? "all"

    const nextRole = ["all", "user", "assistant"].includes(roleParam)
      ? (roleParam as "all" | "user" | "assistant")
      : "all"
    const nextRange = ["all", "24h", "7d"].includes(rangeParam)
      ? (rangeParam as "all" | "24h" | "7d")
      : "all"

    setSearchQuery((prev) => (prev !== paramsValue ? paramsValue : prev))
    setSearchRole((prev) => (prev !== nextRole ? nextRole : prev))
    setSearchRange((prev) => (prev !== nextRange ? nextRange : prev))
  }, [searchParamsString])

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString)
    if (searchQuery) {
      params.set("q", searchQuery)
    } else {
      params.delete("q")
    }

    if (searchRole !== "all") {
      params.set("role", searchRole)
    } else {
      params.delete("role")
    }

    if (searchRange !== "all") {
      params.set("range", searchRange)
    } else {
      params.delete("range")
    }

    const next = params.toString()
    const target = next ? `${pathname}?${next}` : pathname
    const current = searchParamsString
    if (next !== current) {
      router.replace(target)
    }
  }, [
    searchQuery,
    searchRole,
    searchRange,
    pathname,
    router,
    searchParamsString,
  ])

  const currentUserId = clientId ?? "anonymous"
  const isReadOnly = searchParams.get("view") === "read"

  function toggleReactionState(
    message: Message,
    emoji: string,
    userId: string
  ) {
    const reactions = message.reactions ? { ...message.reactions } : {}
    const existing = new Set(reactions[emoji] ?? [])
    if (existing.has(userId)) {
      existing.delete(userId)
    } else {
      existing.add(userId)
    }
    if (existing.size === 0) {
      delete reactions[emoji]
    } else {
      reactions[emoji] = Array.from(existing)
    }
    return reactions
  }

  async function updateMessageOnServer(payload: object) {
    try {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => "")
        throw new Error(text || "Failed to update message")
      }
    } catch (err) {
      console.error("Message update error:", err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function deleteMessageOnServer(messageId: string) {
    try {
      const response = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, id: messageId }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => "")
        throw new Error(text || "Failed to delete message")
      }
    } catch (err) {
      console.error("Message delete error:", err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleEditMessage(messageId: string, content: string) {
    if (isReadOnly) return
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, content, updatedAt: Date.now() }
          : message
      )
    )
    await updateMessageOnServer({ roomId, id: messageId, content })
  }

  async function handleDeleteMessage(messageId: string) {
    if (isReadOnly) return
    setMessages((prev) => prev.filter((message) => message.id !== messageId))
    await deleteMessageOnServer(messageId)
  }

  async function handleTogglePin(messageId: string, nextPinned: boolean) {
    if (isReadOnly) return
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, pinned: nextPinned } : message
      )
    )
    await updateMessageOnServer({ roomId, id: messageId, pinned: nextPinned })
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (isReadOnly) return
    const userId = currentUserId
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              reactions: toggleReactionState(message, emoji, userId),
            }
          : message
      )
    )
    await updateMessageOnServer({
      roomId,
      id: messageId,
      reaction: emoji,
      userId,
    })
  }

  async function handleResolveFlag(messageId: string) {
    if (isReadOnly) return
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, flags: [] } : message
      )
    )
    await updateMessageOnServer({ roomId, id: messageId, resolve: true })
  }

  async function handleHideMessage(messageId: string, hidden: boolean) {
    if (isReadOnly) return
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, hidden } : message
      )
    )
    await updateMessageOnServer({ roomId, id: messageId, hidden })
  }

  async function handleFlagMessage(messageId: string, flag: string) {
    if (isReadOnly) return
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message
        const nextFlags = new Set(message.flags ?? [])
        nextFlags.add(flag)
        return { ...message, flags: Array.from(nextFlags) }
      })
    )
    await updateMessageOnServer({ roomId, id: messageId, flag })
  }

  async function handleRetryMessage(messageId: string) {
    if (isReadOnly) return
    const message = messages.find((item) => item.id === messageId)
    if (!message || message.role !== "user") return

    const updated = messages.map((item) =>
      item.id === messageId ? { ...item, status: "pending" as const } : item
    )
    setMessages(updated)
    await sendMessages(updated)
  }

  function formatPresenceLabel(user: PresenceUser) {
    if (user.id === currentUserId) return "You"
    if (user.name) return user.name
    return `User ${user.id.slice(0, 4)}`
  }

  function formatPresenceTime(lastSeen: number) {
    const seconds = Math.max(0, Math.floor((Date.now() - lastSeen) / 1000))
    if (seconds < 10) return "Active now"
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  function presenceColor(id: string) {
    const colors = [
      "bg-emerald-500",
      "bg-sky-500",
      "bg-amber-500",
      "bg-rose-500",
      "bg-indigo-500",
      "bg-teal-500",
    ]
    let hash = 0
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash + id.charCodeAt(i) * (i + 1)) % colors.length
    }
    return colors[hash]
  }

  function presenceInitials(label: string) {
    return label
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
  }

  function formatSize(size: number) {
    if (size < 1024) return `${size}B`
    if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`
    return `${(size / (1024 * 1024)).toFixed(1)}MB`
  }

  function formatMs(ms: number) {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  function detectFlags(content: string) {
    const flags: string[] = []
    if (/(.)\1{6,}/.test(content)) flags.push("repeated-characters")
    if (/https?:\/\/\S+/gi.test(content) && content.length < 30) {
      flags.push("link-only")
    }
    const bannedKeywords = ["free money", "giveaway", "scam", "spam"]
    const lowered = content.toLowerCase()
    if (bannedKeywords.some((keyword) => lowered.includes(keyword))) {
      flags.push("banned-keyword")
    }
    return flags
  }

  async function handleCopyShareLink() {
    try {
      const url = new URL(`${window.location.origin}/room/${roomId}`)
      url.searchParams.set("view", "read")
      await navigator.clipboard.writeText(url.toString())
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1500)
    } catch (err) {
      console.error("Share link error:", err)
    }
  }

  function buildExportPayload(format: "txt" | "md" | "json") {
    const exportMessages = messages.filter((message) => !message.localOnly)
    if (format === "json") {
      return JSON.stringify(exportMessages, null, 2)
    }

    if (format === "md") {
      return exportMessages
        .map((message) => {
          const label = message.role === "user" ? "User" : "Assistant"
          return `### ${label}\n\n${message.content}\n`
        })
        .join("\n")
    }

    return exportMessages
      .map((message) => {
        const timestamp = message.createdAt
          ? new Date(message.createdAt).toLocaleString()
          : "Unknown time"
        const label = message.role === "user" ? "User" : "Assistant"
        return `[${timestamp}] ${label}: ${message.content}`
      })
      .join("\n")
  }

  function downloadExport(format: "txt" | "md" | "json") {
    const payload = buildExportPayload(format)
    const blob = new Blob([payload], {
      type: format === "json" ? "application/json" : "text/plain",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `room-${roomId}.${format}`
    link.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  return (
    <Card className="w-full max-w-4xl border-slate-200/70 bg-white/80 shadow-sm backdrop-blur">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold">AI Chat</CardTitle>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Room #{roomId}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600">
              <span
                className={`h-2 w-2 rounded-full ${
                  isLoading ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
              <span>{isLoading ? "Responding" : "Live"}</span>
            </div>
            {isReadOnly && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                Read-only
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleCopyShareLink}
            >
              {shareCopied ? "Link copied" : "Share"}
            </Button>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setExportOpen((prev) => !prev)}
              >
                Export
              </Button>
              {exportOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
                  <button
                    type="button"
                    onClick={() => downloadExport("txt")}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    Export TXT
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadExport("md")}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    Export Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadExport("json")}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    Export JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {presenceUsers.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No one else is here yet.
            </span>
          )}
          {presenceUsers.slice(0, 6).map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white ${presenceColor(
                  user.id
                )}`}
              >
                {presenceInitials(formatPresenceLabel(user))}
              </span>
              <span>{formatPresenceLabel(user)}</span>
              {user.isTyping ? (
                <span className="text-[0.65rem] text-emerald-500">typing</span>
              ) : (
                <span className="text-[0.65rem] text-slate-400">
                  {formatPresenceTime(user.lastSeen)}
                </span>
              )}
            </div>
          ))}
          {presenceUsers.length > 6 && (
            <span className="text-xs text-muted-foreground">
              +{presenceUsers.length - 6} more
            </span>
          )}
        </div>

        {analytics && (
          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                Messages
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {analytics.userMessages + analytics.assistantMessages}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                Avg response
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMs(analytics.avgResponseMs || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                Last response
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMs(analytics.lastResponseMs || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                Tokens
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {analytics.tokenUsage.total}
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            ref={searchInputRef}
            className="min-w-[220px] flex-1 rounded-full bg-white/90 shadow-sm"
            aria-label="Search messages"
          />
          <select
            value={searchRole}
            onChange={(e) =>
              setSearchRole(e.target.value as "all" | "user" | "assistant")
            }
            className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600"
          >
            <option value="all">All roles</option>
            <option value="user">Users</option>
            <option value="assistant">Assistant</option>
          </select>
          <select
            value={searchRange}
            onChange={(e) =>
              setSearchRange(e.target.value as "all" | "24h" | "7d")
            }
            className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600"
          >
            <option value="all">All time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
          </select>
          <button
            type="button"
            onClick={() => setHideFlagged((prev) => !prev)}
            className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600"
          >
            {hideFlagged ? "Show flagged" : "Hide flagged"}
          </button>
          {(normalizedSearch ||
            searchRole !== "all" ||
            searchRange !== "all" ||
            !hideFlagged) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setSearchQuery("")
                setSearchRole("all")
                setSearchRange("all")
                setHideFlagged(true)
              }}
            >
              Clear filters
            </Button>
          )}
          {normalizedSearch && (
            <div className="text-xs text-muted-foreground">
              {filteredMessages.length} match
              {filteredMessages.length === 1 ? "" : "es"}
            </div>
          )}
          {normalizedSearch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </Button>
          )}
        </div>

        <MessageList
          messages={filteredMessages}
          streamingContent={showStreaming ? streaming || undefined : undefined}
          searchQuery={normalizedSearch || undefined}
          currentUserId={currentUserId}
          reactionOptions={reactionOptions}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onTogglePin={handleTogglePin}
          onToggleReaction={handleToggleReaction}
          onRetryMessage={handleRetryMessage}
          onFlagMessage={handleFlagMessage}
          onResolveFlag={handleResolveFlag}
          onHideMessage={handleHideMessage}
          readOnly={isReadOnly}
          emptyState={{
            title: normalizedSearch
              ? "No matches found."
              : "Start the conversation with a question or a creative prompt.",
            description: normalizedSearch
              ? "Try a different keyword or clear the search."
              : undefined,
          }}
        />

        {typingUsers.length > 0 && (
          <div className="text-xs text-muted-foreground" aria-live="polite">
            {typingUsers.join(", ")} typing...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Error: {error}
          </div>
        )}

        {!isReadOnly && (
          <>
            <Separator />

            <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
              <div className="flex-1">
                {attachments.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 text-xs text-slate-600"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] uppercase text-slate-500">
                            {attachment.type}
                          </span>
                          <span className="font-medium text-slate-700">
                            {attachment.name}
                          </span>
                          <span>{formatSize(attachment.size)}</span>
                          {attachment.previewError && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.65rem] text-amber-700">
                              {attachment.previewError}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Ask something thoughtful... (Shift+Enter for a new line)"
                  disabled={isLoading}
                  ref={messageInputRef}
                  rows={3}
                  className="min-h-[3.2rem] w-full resize-y rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-slate-300"
                  aria-label="Message input"
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  Use <span className="font-medium">/help</span> for commands.
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={handleAttachmentChange}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
              >
                Attach
              </Button>
              {isLoading ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full"
                  onClick={handleStop}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="rounded-full"
                >
                  Send
                </Button>
              )}
              {!isLoading && messages.some((m) => m.role === "user") && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={handleRegenerate}
                >
                  Regenerate
                </Button>
              )}
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
