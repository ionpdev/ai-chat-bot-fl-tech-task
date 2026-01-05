# AI Chat Bot

A full-stack AI chat application with real-time streaming and WebSocket broadcasting, built with Next.js 15 and Google's Gemini AI.

## Features

- **AI-Powered Chat** — Powered by Google Gemini 2.5 Flash Lite via Vercel AI SDK
- **Real-time Streaming** — Token-by-token AI response streaming
- **WebSocket Broadcasting** — Live updates across multiple clients
- **Dynamic Chat Rooms** — Create and join rooms via URL (`/room/my-room`)
- **Typing Indicators** — See when others are typing
- **Message Persistence** — In-memory storage (easily swappable to database)
- **Presence + Avatars** — Live presence chips with timestamps
- **Message Actions** — Edit/delete/retry, pin, reactions, and flagging
- **Markdown + Code** — Rich formatting, code blocks, copy buttons
- **Search + Filters** — Keyword search with role/date filters
- **Attachments** — Image/PDF uploads with previews + extraction
- **Share + Export** — Read-only share links, export to TXT/MD/JSON
- **Moderation** — Rate limits, slow mode, spam flags, hide/resolve actions
- **Analytics** — Per-room response time + token usage
- **Modern UI** — Built with Tailwind CSS and shadcn/ui components

## Chat Rooms

Rooms are URL-based and fully dynamic:

| URL             | Description                               |
| --------------- | ----------------------------------------- |
| `/`             | Home page with lobby chat + room selector |
| `/room/lobby`   | Default lobby room                        |
| `/room/general` | General discussion room                   |
| `/room/my-team` | Custom room (any name works)              |

### Creating Rooms

- **Via URL**: Navigate to `/room/any-name-here` to create/join a room
- **Via UI**: Click "+ Create new room" on the home page
- **Share**: Send the URL to others to chat in the same room

All users in the same room see real-time AI responses and typing indicators.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Chat UI   │    │  WS Client  │    │   HTTP Requests     │ │
│  │  (React)    │◀──▶│  (Real-time)│    │  (fetch /api/*)     │ │
│  └─────────────┘    └──────┬──────┘    └──────────┬──────────┘ │
└────────────────────────────│───────────────────────│────────────┘
                             │ WebSocket              │ HTTP
                             ▼                        ▼
┌────────────────────────────────────┐  ┌─────────────────────────┐
│        WS Server (:8787)           │  │    Next.js App (:3000)  │
│  ┌──────────────────────────────┐  │  │  ┌───────────────────┐  │
│  │  /ws       - WebSocket conn  │  │  │  │  /api/stream      │  │
│  │  /broadcast - HTTP endpoint  │◀─┼──┼──│  /api/typing      │  │
│  │  /health   - Health check    │  │  │  └───────────────────┘  │
│  └──────────────────────────────┘  │  │           │             │
│              │                     │  │           ▼             │
│              ▼                     │  │  ┌───────────────────┐  │
│  ┌──────────────────────────────┐  │  │  │   AI SDK          │  │
│  │      Room Management         │  │  │  │   (Google Gemini) │  │
│  │  - Join/leave rooms          │  │  │  └───────────────────┘  │
│  │  - Broadcast to clients      │  │  │           │             │
│  └──────────────────────────────┘  │  │           ▼             │
└────────────────────────────────────┘  │  ┌───────────────────┐  │
                                        │  │   Message Store   │  │
                                        │  │   (In-memory DB)  │  │
                                        │  └───────────────────┘  │
                                        └─────────────────────────┘
```

### Data Flow

1. **User sends message** → `POST /api/stream`
2. **Next.js streams AI response** → Returns HTTP streaming response
3. **Tokens broadcast via WS** → `POST /broadcast` → WebSocket to all clients
4. **Typing indicators** → `POST /api/typing` → Broadcast to room

### Real-time Sync (Multi-user)

When multiple users are in the same room, messages sync in real-time:

```
User A sends "Hello"
    ↓
POST /api/stream { senderId: "user-a", messages: [...] }
    ↓
Server saves message & broadcasts:
    { type: "user-message", senderId: "user-a", content: "Hello" }
    ↓
User B receives via WebSocket → message appears instantly
(User A skips — they already have it locally)
    ↓
AI generates response, tokens broadcast:
    { type: "token", delta: "Hi" }
    { type: "token", delta: " there!" }
    ↓
Both users see streaming AI response
    ↓
{ type: "done" } → AI response complete
```

**Events broadcast to rooms:**
| Event | Description |
|-------|-------------|
| `user-message` | New message from a user |
| `token` | AI response token (streaming) |
| `done` | AI response complete |
| `typing` | User typing indicator |
| `assistant-message` | Final assistant reply |
| `message-updated` | Message edits/pins/reactions/flags |
| `message-deleted` | Message deleted |
| `presence` | Presence updates |
| `error` | Error occurred |

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **AI**: Vercel AI SDK v6 + Google Gemini 2.5 Flash Lite
- **Real-time**: Standalone WebSocket server with HTTP broadcast endpoint
- **UI**: React 19, Tailwind CSS, shadcn/ui
- **Language**: TypeScript
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 18+
- Google AI API key ([Get one here](https://aistudio.google.com/apikey))

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Google AI API key:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

3. Start the WebSocket server:

```bash
npm run ws
```

4. Start the development server (in a new terminal):

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable                       | Description                   | Default                           |
| ------------------------------ | ----------------------------- | --------------------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key             | Required                          |
| `AI_MODEL`                     | Model ID to use               | `gemini-2.5-flash-lite`           |
| `WS_URL`                       | WebSocket server URL (client) | `ws://localhost:8787/ws`          |
| `WS_BROADCAST_URL`             | Broadcast endpoint URL        | `http://localhost:8787/broadcast` |
| `WS_PORT`                      | WebSocket server port         | `8787`                            |
| `NEXT_PUBLIC_WS_URL`           | Public WS URL for browser     | `ws://localhost:8787/ws`          |

## Scripts

```bash
npm run dev       # Start Next.js development server
npm run ws        # Start WebSocket server
npm run build     # Build for production
npm run start     # Start production server
npm run test      # Run tests
npm run lint      # Run ESLint
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── stream/route.ts    # AI streaming endpoint
│   │   └── typing/route.ts    # Typing indicator endpoint
│   │   ├── messages/route.ts  # Message edits/pins/reactions/flags
│   │   ├── presence/route.ts  # Presence heartbeat + list
│   │   ├── analytics/route.ts # Room analytics
│   │   └── admin/             # Admin APIs (overview, moderation, settings)
│   ├── room/
│   │   └── [roomId]/page.tsx  # Dynamic room page
│   ├── admin/
│   │   └── page.tsx           # Admin dashboard
│   ├── actions.ts             # Server actions (AI streaming)
│   ├── page.tsx               # Home page with room selector
│   └── layout.tsx             # Root layout
├── components/
│   ├── Chat.tsx               # Main chat component
│   ├── MessageList.tsx        # Message display
│   ├── AdminDashboard.tsx     # Admin UI
│   ├── RoomDiscovery.tsx      # Room discovery + recents
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── db.ts                  # In-memory message store
│   ├── env.ts                 # Environment config
│   ├── ws-client.ts           # Browser WebSocket client
│   ├── ws-server.ts           # Standalone WS server
│   └── utils.ts               # Utilities
└── utils/
    └── sortStrings.ts         # String sorting utilities
```
