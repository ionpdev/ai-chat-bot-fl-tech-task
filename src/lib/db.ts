import { randomUUID } from "crypto"

// In-memory database - ready to swap for Postgres later
export type Message = {
  id: string
  roomId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
  updatedAt?: number
  senderId?: string
  pinned?: boolean
  reactions?: Record<string, string[]>
  attachments?: Attachment[]
  flags?: string[]
  hidden?: boolean
}

export type Attachment = {
  id: string
  name: string
  type: "image" | "pdf"
  url: string
  size: number
  previewText?: string
}

export type User = {
  id: string
  roomId: string
  isTyping: boolean
  lastSeen: number
  name?: string
}

export type RoomStats = {
  roomId: string
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

export type RoomSettings = {
  roomId: string
  rateLimitMax: number
  rateLimitWindowMs: number
  slowModeMs: number
}

export type ModerationLog = {
  id: string
  roomId: string
  action: string
  targetId?: string
  actor?: string
  createdAt: number
  details?: string
}

// In-memory storage
const messages: Message[] = []
const users: Map<string, User> = new Map()
const roomStats: Map<string, RoomStats> = new Map()
const roomSettings: Map<string, RoomSettings> = new Map()
const moderationLogs: ModerationLog[] = []

// Message operations
export const saveMessage = (message: Message): void => {
  messages.push(message)
}

export const listMessages = (roomId: string): Message[] => {
  return messages
    .filter((m) => m.roomId === roomId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export const listAllMessages = (): Message[] => {
  return [...messages].sort((a, b) => b.createdAt - a.createdAt)
}

export const listRooms = (): string[] => {
  return Array.from(new Set(messages.map((message) => message.roomId)))
}

export const getMessage = (id: string): Message | undefined => {
  return messages.find((message) => message.id === id)
}

export const updateMessage = (
  id: string,
  updates: Partial<Omit<Message, "id" | "roomId" | "createdAt">>
): Message | undefined => {
  const message = messages.find((m) => m.id === id)
  if (!message) return undefined

  Object.assign(message, updates, { updatedAt: Date.now() })
  return message
}

export const flagMessage = (id: string, flag: string): Message | undefined => {
  const message = messages.find((m) => m.id === id)
  if (!message) return undefined

  const currentFlags = new Set(message.flags ?? [])
  currentFlags.add(flag)
  message.flags = Array.from(currentFlags)
  message.updatedAt = Date.now()
  return message
}

export const resolveFlags = (id: string): Message | undefined => {
  const message = messages.find((m) => m.id === id)
  if (!message) return undefined
  message.flags = []
  message.updatedAt = Date.now()
  return message
}

export const toggleReaction = (
  id: string,
  emoji: string,
  userId: string
): Message | undefined => {
  const message = messages.find((m) => m.id === id)
  if (!message) return undefined

  if (!message.reactions) {
    message.reactions = {}
  }

  const existing = new Set(message.reactions[emoji] ?? [])
  if (existing.has(userId)) {
    existing.delete(userId)
  } else {
    existing.add(userId)
  }

  if (existing.size === 0) {
    delete message.reactions[emoji]
  } else {
    message.reactions[emoji] = Array.from(existing)
  }

  message.updatedAt = Date.now()
  return message
}

export const deleteMessage = (id: string): boolean => {
  const index = messages.findIndex((m) => m.id === id)
  if (index > -1) {
    messages.splice(index, 1)
    return true
  }
  return false
}

// Analytics
export const getRoomStats = (roomId: string): RoomStats => {
  return (
    roomStats.get(roomId) ?? {
      roomId,
      userMessages: 0,
      assistantMessages: 0,
      avgResponseMs: 0,
      lastResponseMs: 0,
      totalResponses: 0,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
    }
  )
}

export const updateRoomStats = (
  roomId: string,
  updates: Partial<Omit<RoomStats, "roomId">>
): RoomStats => {
  const current = getRoomStats(roomId)
  const next = {
    ...current,
    ...updates,
    tokenUsage: {
      prompt: updates.tokenUsage?.prompt ?? current.tokenUsage.prompt,
      completion: updates.tokenUsage?.completion ?? current.tokenUsage.completion,
      total: updates.tokenUsage?.total ?? current.tokenUsage.total,
    },
  }
  roomStats.set(roomId, next)
  return next
}

export const getRoomSettings = (roomId: string): RoomSettings => {
  return (
    roomSettings.get(roomId) ?? {
      roomId,
      rateLimitMax: 5,
      rateLimitWindowMs: 20000,
      slowModeMs: 0,
    }
  )
}

export const updateRoomSettings = (
  roomId: string,
  updates: Partial<Omit<RoomSettings, "roomId">>
): RoomSettings => {
  const current = getRoomSettings(roomId)
  const next = { ...current, ...updates, roomId }
  roomSettings.set(roomId, next)
  return next
}

export const addModerationLog = (
  entry: Omit<ModerationLog, "id" | "createdAt">
): ModerationLog => {
  const log: ModerationLog = {
    ...entry,
    id: randomUUID(),
    createdAt: Date.now(),
  }
  moderationLogs.unshift(log)
  moderationLogs.splice(200)
  return log
}

export const listModerationLogs = (): ModerationLog[] => {
  return [...moderationLogs]
}

// User operations
export const updateUser = (
  user: Pick<User, "id" | "roomId"> & Partial<User>
): void => {
  const existing = users.get(user.id)
  users.set(user.id, { ...existing, ...user, lastSeen: Date.now() } as User)
}

export const getUser = (userId: string): User | undefined => {
  return users.get(userId)
}

export const getUsersInRoom = (roomId: string): User[] => {
  return Array.from(users.values()).filter((u) => u.roomId === roomId)
}

export const removeUser = (userId: string): void => {
  users.delete(userId)
}

// Cleanup inactive users (called periodically)
export const cleanupInactiveUsers = (timeoutMs: number = 30000): void => {
  const now = Date.now()
  for (const [userId, user] of users.entries()) {
    if (now - user.lastSeen > timeoutMs) {
      users.delete(userId)
    }
  }
}
