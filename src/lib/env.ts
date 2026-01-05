// Environment configuration helper
// Note: GOOGLE_GENERATIVE_AI_API_KEY is read directly by @ai-sdk/google

export const env = {
  // WebSocket server URL for real-time features
  WS_URL: process.env.WS_URL ?? "ws://localhost:8787/ws",

  // AI model to use (defaults to gemini-2.5-flash-lite)
  AI_MODEL: process.env.AI_MODEL ?? "gemini-2.5-flash-lite",

  // Environment mode
  NODE_ENV: process.env.NODE_ENV ?? "development",
}
