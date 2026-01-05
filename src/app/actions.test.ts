import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock environment
vi.stubEnv("AI_MODEL", "gemini-2.5-flash-lite")
vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key")

const saveMessageMock = vi.fn()
vi.mock("@/lib/db", () => ({
  saveMessage: (...args: any[]) => saveMessageMock(...args),
}))

vi.mock("@ai-sdk/google", () => ({
  google: (modelId: string) => ({ modelId, provider: "google" }),
}))

// Mock the ai.streamText to provide a controllable textStream and call onFinish
vi.mock("ai", () => ({
  streamText: (opts: any) => {
    const deltas = ["Hello ", "world"]
    const result = {
      textStream: (async function* () {
        for (const d of deltas) {
          yield d
        }
      })(),
      toTextStreamResponse: () => new Response("Hello world", { status: 200 }),
    }

    // call onFinish asynchronously
    ;(async () => {
      const text = deltas.join("")
      if (opts && typeof opts.onFinish === "function") {
        await Promise.resolve()
        await opts.onFinish({
          text,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
      }
    })()

    return result
  },
}))

describe("streamRoomReply", () => {
  beforeEach(() => {
    saveMessageMock.mockReset()
  })

  it("saves user and assistant messages and returns streaming response", async () => {
    const { streamRoomReply } = await import("./actions")

    const roomId = "test-room"
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "Hi" },
    ]

    const response = await streamRoomReply(roomId, messages)

    // Should return a Response object
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)

    // Wait for onFinish to be called
    await new Promise((r) => setTimeout(r, 10))

    // saveMessage should be called for user and assistant
    expect(saveMessageMock).toHaveBeenCalled()
    const calls = saveMessageMock.mock.calls.map((c) => c[0])
    const roles = calls.map((c: any) => c.role)
    expect(roles).toContain("user")
    expect(roles).toContain("assistant")
  })

  it("handles messages array correctly", async () => {
    const { streamRoomReply } = await import("./actions")

    const roomId = "test-room-2"
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "How are you?" },
    ]

    const response = await streamRoomReply(roomId, messages)

    expect(response).toBeInstanceOf(Response)

    // Wait for async operations
    await new Promise((r) => setTimeout(r, 10))

    // Should save the last user message
    const userCalls = saveMessageMock.mock.calls.filter(
      (c) => c[0].role === "user"
    )
    expect(userCalls.length).toBeGreaterThan(0)
    expect(userCalls[0][0].content).toBe("How are you?")
  })
})
