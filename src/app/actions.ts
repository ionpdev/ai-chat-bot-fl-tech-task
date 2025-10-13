"use server"

import { streamText } from "ai"
import { openai } from "@ai-sdk/openai"
import { saveMessage } from "@/lib/db"
import { env } from "@/lib/env"
import { randomUUID } from "crypto"
import WebSocket from "ws"

// WebSocket client cache for broadcasting
const wsClients = new Map<string, WebSocket>()

function getWS(roomId: string): WebSocket {
  const existing = wsClients.get(roomId)
  if (existing && existing.readyState === WebSocket.OPEN) {
    return existing
  }

  // Create new WebSocket connection to our server
  const ws = new WebSocket(`${env.WS_URL}?roomId=${encodeURIComponent(roomId)}`)

  ws.on("open", () => {
    console.log(`Server connected to WS room: ${roomId}`)
  })

  ws.on("close", () => {
    console.log(`Server disconnected from WS room: ${roomId}`)
    wsClients.delete(roomId)
  })

  ws.on("error", (error) => {
    console.error(`Server WS error for room ${roomId}:`, error)
    wsClients.delete(roomId)
  })

  wsClients.set(roomId, ws)
  return ws
}

export async function streamRoomReply(
  roomId: string,
  messages: { role: "user" | "assistant"; content: string }[]
) {
  try {
    // Save user message first
    const userMessage = messages[messages.length - 1]
    if (userMessage.role === "user") {
      saveMessage({
        id: randomUUID(),
        roomId,
        role: "user",
        content: userMessage.content,
        createdAt: Date.now(),
      })
    }

    // Start streaming from OpenAI
    const result = await streamText({
      model: openai("gpt-4o-mini"), // Using mini for cost efficiency
      messages,
      onFinish: async ({ text, usage }) => {
        // Save assistant response
        saveMessage({
          id: randomUUID(),
          roomId,
          role: "assistant",
          content: text,
          createdAt: Date.now(),
        })

        // Broadcast completion to room
        const ws = getWS(roomId)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "done" }))
        }

        // Log usage for monitoring
        console.log("AI Usage:", usage)
      },
    })

    // Broadcast tokens to WebSocket room as they arrive
    ;(async () => {
      try {
        for await (const delta of result.textStream) {
          const ws = getWS(roomId)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "token", delta }))
          }
        }
      } catch (error) {
        console.error("Error broadcasting tokens:", error)
        const ws = getWS(roomId)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Streaming error occurred",
            })
          )
        }
      }
    })()

    // Return the stream response for the caller
    return result.toTextStreamResponse()
  } catch (error) {
    console.error("Error in streamRoomReply:", error)
    throw new Error("Failed to generate AI response")
  }
}
