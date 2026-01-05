import { NextRequest } from "next/server"
import { streamRoomReply } from "@/app/actions"
import { getRoomSettings } from "@/lib/db"

type RateEntry = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateEntry>()
const slowModeStore = new Map<string, number>()

function checkRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: max - 1 }
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now }
  }

  entry.count += 1
  return { allowed: true, remaining: max - entry.count }
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

export async function POST(req: NextRequest) {
  try {
    const { roomId, messages, senderId, clientMessageId, attachments } =
      await req.json()

    if (!roomId || !messages || !Array.isArray(messages)) {
      return new Response("Invalid request body", { status: 400 })
    }

    const lastUser = messages[messages.length - 1]
    const actor = senderId ?? "anonymous"
    const settings = getRoomSettings(roomId)

    const rateKey = `${roomId}:${actor}`
    const rate = checkRateLimit(
      rateKey,
      settings.rateLimitMax,
      settings.rateLimitWindowMs
    )
    if (!rate.allowed) {
      return new Response("Rate limit exceeded. Please slow down.", {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((rate.retryAfterMs ?? 0) / 1000).toString(),
        },
      })
    }

    if (settings.slowModeMs > 0) {
      const lastAt = slowModeStore.get(rateKey) ?? 0
      const now = Date.now()
      if (now - lastAt < settings.slowModeMs) {
        return new Response("Slow mode enabled. Please wait.", {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              (settings.slowModeMs - (now - lastAt)) / 1000
            ).toString(),
          },
        })
      }
      slowModeStore.set(rateKey, now)
    }

    const flags = lastUser?.content ? detectFlags(lastUser.content) : []

    return streamRoomReply(
      roomId,
      messages,
      senderId,
      clientMessageId,
      attachments,
      flags
    )
  } catch (error) {
    console.error("Stream API error:", error)
    // In development, return the error message to help debugging.
    const isDev = process.env.NODE_ENV !== "production"
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? "Unknown error")
    const body = isDev
      ? `Stream API error: ${errorMessage}`
      : "Internal server error"
    return new Response(body, { status: 500 })
  }
}
