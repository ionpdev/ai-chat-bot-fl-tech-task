// In-memory database - ready to swap for Postgres later
export type Message = {
  id: string
  roomId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

export type User = {
  id: string
  roomId: string
  isTyping: boolean
  lastSeen: number
}

// In-memory storage
const messages: Message[] = []
const users: Map<string, User> = new Map()

// Message operations
export const saveMessage = (message: Message): void => {
  messages.push(message)
}

export const listMessages = (roomId: string): Message[] => {
  return messages
    .filter((m) => m.roomId === roomId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export const deleteMessage = (id: string): boolean => {
  const index = messages.findIndex((m) => m.id === id)
  if (index > -1) {
    messages.splice(index, 1)
    return true
  }
  return false
}

// User operations
export const updateUser = (user: User): void => {
  users.set(user.id, { ...user, lastSeen: Date.now() })
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
