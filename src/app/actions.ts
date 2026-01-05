"use server"

import { streamText } from "ai"
import { google } from "@ai-sdk/google"
import { saveMessage } from "@/lib/db"
import { randomUUID } from "crypto"

// Broadcast URL for the standalone WS server
const BROADCAST_URL =
  process.env.WS_BROADCAST_URL ?? "http://localhost:8787/broadcast"

/**
 * Broadcast a message to a room via the WS server's HTTP endpoint.
 * This avoids native module issues with the `ws` package in Next.js.
 */
async function broadcastToRoom(roomId: string, message: object) {
  try {
    await fetch(BROADCAST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, message }),
    })
  } catch (err) {
    console.error("Failed to broadcast to room:", err)
  }
}

/**
 * Stream AI response for a chat room.
 *
 * Uses the Vercel AI SDK with Google's Gemini model.
 * Broadcasts tokens and completion via the standalone WS server.
 */
export async function streamRoomReply(
  roomId: string,
  messages: { role: "user" | "assistant"; content: string }[],
  senderId?: string
) {
  // Save user message first
  const userMessage = messages[messages.length - 1]
  const messageId = randomUUID()

  if (userMessage?.role === "user") {
    saveMessage({
      id: messageId,
      roomId,
      role: "user",
      content: userMessage.content,
      createdAt: Date.now(),
    })

    // Broadcast user message to all clients in the room
    await broadcastToRoom(roomId, {
      type: "user-message",
      id: messageId,
      content: userMessage.content,
      senderId: senderId ?? "anonymous",
    })
  }

  // Get model from env or use default
  const modelId = process.env.AI_MODEL ?? "gemini-2.5-flash-lite"

  // Create the model instance - SDK reads GOOGLE_GENERATIVE_AI_API_KEY automatically
  const model = google(modelId)

  // Stream the response
  const result = streamText({
    model,
    messages,
    onFinish: async ({ text, usage }) => {
      // Save assistant response when streaming completes
      saveMessage({
        id: randomUUID(),
        roomId,
        role: "assistant",
        content: text,
        createdAt: Date.now(),
      })

      // Broadcast completion to room
      await broadcastToRoom(roomId, { type: "done" })

      console.log("AI Usage:", {
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
      })
    },
  })

  // Broadcast tokens as they arrive (in background)
  ;(async () => {
    try {
      for await (const delta of result.textStream) {
        await broadcastToRoom(roomId, { type: "token", delta })
      }
    } catch (err) {
      console.error("Error streaming tokens:", err)
      await broadcastToRoom(roomId, {
        type: "error",
        message: "Streaming error",
      })
    }
  })()

  // Return the streaming response
  return result.toTextStreamResponse()
}
