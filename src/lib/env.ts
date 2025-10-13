// Environment configuration helper
export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  AI_PROVIDER: process.env.AI_PROVIDER ?? "openai",
  WS_URL: process.env.WS_URL ?? "ws://localhost:8787/ws",
  NODE_ENV: process.env.NODE_ENV ?? "development",
}

// Validate required environment variables
if (!env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable")
}
