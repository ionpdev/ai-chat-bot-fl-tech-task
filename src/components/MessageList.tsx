"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  senderId?: string
  pinned?: boolean
  reactions?: Record<string, string[]>
  attachments?: Attachment[]
  flags?: string[]
  hidden?: boolean
  status?: "pending" | "sent" | "error"
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

type EmptyState = {
  title: string
  description?: string
}

interface MessageListProps {
  messages: Message[]
  streamingContent?: string
  searchQuery?: string
  emptyState?: EmptyState
  currentUserId: string
  reactionOptions: string[]
  onEditMessage: (messageId: string, content: string) => void
  onDeleteMessage: (messageId: string) => void
  onTogglePin: (messageId: string, pinned: boolean) => void
  onToggleReaction: (messageId: string, emoji: string) => void
  onRetryMessage: (messageId: string) => void
  onFlagMessage: (messageId: string, flag: string) => void
  onResolveFlag: (messageId: string) => void
  onHideMessage: (messageId: string, hidden: boolean) => void
  readOnly?: boolean
}

type MarkdownBlock =
  | {
      type: "code"
      language?: string
      content: string
      calloutVariant?: string
    }
  | {
      type: "text"
      content: string
    }

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlightText(text: string, query: string | undefined, keyBase: string) {
  if (!query) return text
  const regex = new RegExp(`(${escapeRegExp(query)})`, "ig")
  const parts = text.split(regex)
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={`${keyBase}-mark-${index}`}
        className="rounded bg-amber-200/70 px-1"
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function renderTextWithLinks(
  text: string,
  query: string | undefined,
  keyBase: string
) {
  const urlPattern = /(https?:\/\/[^\s)]+)/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`${keyBase}-plain-${lastIndex}`}>
          {highlightText(
            text.slice(lastIndex, match.index),
            query,
            `${keyBase}-plain-${lastIndex}`
          )}
        </span>
      )
    }

    const url = match[1]
    nodes.push(
      <a
        key={`${keyBase}-auto-${match.index}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-sky-600 underline decoration-sky-300 underline-offset-2 transition hover:text-sky-700"
      >
        {highlightText(url, query, `${keyBase}-auto-${match.index}`)}
      </a>
    )

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(
      <span key={`${keyBase}-plain-tail`}>
        {highlightText(text.slice(lastIndex), query, `${keyBase}-plain-tail`)}
      </span>
    )
  }

  return nodes
}

function renderEmphasis(text: string, query: string | undefined, keyBase: string) {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/
  if (!pattern.test(text)) {
    return renderTextWithLinks(text, query, keyBase)
  }

  const segments = text.split(pattern).filter(Boolean)
  return segments.map((segment, index) => {
    if (
      (segment.startsWith("**") && segment.endsWith("**")) ||
      (segment.startsWith("__") && segment.endsWith("__"))
    ) {
      const inner = segment.slice(2, -2)
      return (
        <strong key={`${keyBase}-strong-${index}`}>
          {renderTextWithLinks(inner, query, `${keyBase}-strong-${index}`)}
        </strong>
      )
    }

    if (
      (segment.startsWith("*") && segment.endsWith("*")) ||
      (segment.startsWith("_") && segment.endsWith("_"))
    ) {
      const inner = segment.slice(1, -1)
      return (
        <em key={`${keyBase}-em-${index}`}>
          {renderTextWithLinks(inner, query, `${keyBase}-em-${index}`)}
        </em>
      )
    }

    return (
      <span key={`${keyBase}-text-${index}`}>
        {renderTextWithLinks(segment, query, `${keyBase}-text-${index}`)}
      </span>
    )
  })
}

function renderInline(text: string, query: string | undefined, keyBase: string) {
  const tokenPattern =
    /`([^`]+)`|!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`${keyBase}-inline-${lastIndex}`}>
          {renderEmphasis(
            text.slice(lastIndex, match.index),
            query,
            `${keyBase}-inline-${lastIndex}`
          )}
        </span>
      )
    }

    if (match[1]) {
      nodes.push(
        <code
          key={`${keyBase}-code-${match.index}`}
          className="rounded bg-slate-900/90 px-1 py-0.5 font-mono text-[0.78rem] text-slate-50"
        >
          {match[1]}
        </code>
      )
    } else if (match[2] && match[3]) {
      nodes.push(
        <span key={`${keyBase}-img-${match.index}`} className="block">
          <Image
            src={match[3]}
            alt={match[2]}
            width={640}
            height={360}
            sizes="(max-width: 768px) 100vw, 640px"
            unoptimized
            className="max-h-56 w-auto rounded-lg border border-slate-200/70"
            loading="lazy"
          />
        </span>
      )
    } else if (match[4] && match[5]) {
      nodes.push(
        <a
          key={`${keyBase}-link-${match.index}`}
          href={match[5]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 underline decoration-sky-300 underline-offset-2 transition hover:text-sky-700"
        >
          {renderEmphasis(match[4], query, `${keyBase}-link-${match.index}`)}
        </a>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(
      <span key={`${keyBase}-inline-tail`}>
        {renderEmphasis(
          text.slice(lastIndex),
          query,
          `${keyBase}-inline-tail`
        )}
      </span>
    )
  }

  return nodes
}

function splitMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const fencePattern = /```([^\n]+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      })
    }

    const rawLang = match[1]?.trim()
    const contentBody = match[2].trimEnd()
    const calloutMatch = rawLang?.match(/^(callout|note|tip|warning|info)(?::\s*(.+))?$/i)
    if (calloutMatch) {
      blocks.push({
        type: "code",
        language: undefined,
        content: contentBody,
        calloutVariant: calloutMatch[1].toLowerCase(),
      })
    } else {
      blocks.push({
        type: "code",
        language: rawLang,
        content: contentBody,
      })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    blocks.push({
      type: "text",
      content: content.slice(lastIndex),
    })
  }

  return blocks
}

function renderTextBlock(
  content: string,
  query: string | undefined,
  keyBase: string
) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let index = 0
  let paragraphBuffer: string[] = []
  const tableRows: string[][] = []
  let tableAlignments: Array<"left" | "center" | "right"> = []

  function flushParagraph() {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join(" ").trim()
    if (text) {
      elements.push(
        <p key={`${keyBase}-p-${elements.length}`} className="whitespace-pre-wrap">
          {renderInline(text, query, `${keyBase}-p-${elements.length}`)}
        </p>
      )
    }
    paragraphBuffer = []
  }

  function flushTable() {
    if (tableRows.length === 0) return
    const header = tableRows[0] || []
    const body = tableRows.slice(1)
    elements.push(
      <div
        key={`${keyBase}-table-${elements.length}`}
        className="overflow-x-auto rounded-lg border border-slate-200/70"
      >
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 text-slate-700">
            <tr>
              {header.map((cell, cellIndex) => (
                <th
                  key={`${keyBase}-th-${cellIndex}`}
                  className={`px-3 py-2 font-semibold ${
                    tableAlignments[cellIndex] === "center"
                      ? "text-center"
                      : tableAlignments[cellIndex] === "right"
                      ? "text-right"
                      : "text-left"
                  }`}
                >
                  {renderInline(
                    cell,
                    query,
                    `${keyBase}-th-${cellIndex}`
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr
                key={`${keyBase}-tr-${rowIndex}`}
                className="border-t odd:bg-white even:bg-slate-50/60"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${keyBase}-td-${rowIndex}-${cellIndex}`}
                    className={`px-3 py-2 ${
                      tableAlignments[cellIndex] === "center"
                        ? "text-center"
                        : tableAlignments[cellIndex] === "right"
                        ? "text-right"
                        : "text-left"
                    }`}
                  >
                    {renderInline(
                      cell,
                      query,
                      `${keyBase}-td-${rowIndex}-${cellIndex}`
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows.length = 0
    tableAlignments = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      flushTable()
      index += 1
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      flushTable()
      const level = headingMatch[1].length
      const headingText = headingMatch[2]
      const HeadingTag = level === 1 ? "h3" : level === 2 ? "h4" : "h5"
      elements.push(
        <HeadingTag
          key={`${keyBase}-h-${elements.length}`}
          className="text-sm font-semibold"
        >
          {renderInline(
            headingText,
            query,
            `${keyBase}-h-${elements.length}`
          )}
        </HeadingTag>
      )
      index += 1
      continue
    }

    if (trimmed.startsWith(">")) {
      flushParagraph()
      flushTable()
      const quoteLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      elements.push(
        <blockquote
          key={`${keyBase}-blockquote-${elements.length}`}
          className="border-l-2 border-slate-300 pl-3 text-sm text-slate-600"
        >
          {renderInline(
            quoteLines.join(" "),
            query,
            `${keyBase}-blockquote-${elements.length}`
          )}
        </blockquote>
      )
      continue
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushParagraph()
      flushTable()
      const items: string[] = []
      while (
        index < lines.length &&
        (lines[index].trim().startsWith("- ") ||
          lines[index].trim().startsWith("* "))
      ) {
        items.push(lines[index].trim().slice(2))
        index += 1
      }
      elements.push(
        <ul
          key={`${keyBase}-ul-${elements.length}`}
          className="list-disc space-y-1 pl-4 text-sm"
        >
          {items.map((item, itemIndex) => (
            <li key={`${keyBase}-li-${itemIndex}`}>
              {renderInline(item, query, `${keyBase}-li-${itemIndex}`)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (trimmed.includes("|")) {
      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell, cellIndex, arr) => {
          if (arr.length <= 2) return true
          if (cellIndex === 0 || cellIndex === arr.length - 1) {
            return cell !== ""
          }
          return true
        })

      const isDivider = cells.every((cell) => /^:?-{3,}:?$/.test(cell))
      if (isDivider && tableRows.length > 0) {
        tableAlignments = cells.map((cell) => {
          const left = cell.startsWith(":")
          const right = cell.endsWith(":")
          if (left && right) return "center"
          if (right) return "right"
          return "left"
        })
        index += 1
        continue
      }
      if (!isDivider && cells.length > 1) {
        flushParagraph()
        tableRows.push(cells)
        index += 1
        continue
      }
    }

    paragraphBuffer.push(line)
    index += 1
  }

  flushParagraph()
  flushTable()
  return elements
}

function CodeBlock({
  code,
  language,
  calloutVariant,
}: {
  code: string
  language?: string
  calloutVariant?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!navigator?.clipboard) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (calloutVariant) {
    const variantStyles: Record<
      string,
      { label: string; container: string; accent: string }
    > = {
      note: {
        label: "Note",
        container: "border-slate-200/70 bg-slate-50",
        accent: "bg-slate-400",
      },
      tip: {
        label: "Tip",
        container: "border-emerald-200/70 bg-emerald-50/70",
        accent: "bg-emerald-400",
      },
      info: {
        label: "Info",
        container: "border-sky-200/70 bg-sky-50/70",
        accent: "bg-sky-400",
      },
      warning: {
        label: "Warning",
        container: "border-amber-200/70 bg-amber-50/70",
        accent: "bg-amber-400",
      },
      callout: {
        label: "Callout",
        container: "border-slate-200/70 bg-white/80",
        accent: "bg-slate-500",
      },
    }
    const variant = variantStyles[calloutVariant] || variantStyles.callout
    return (
      <div className={`rounded-xl border px-4 py-3 ${variant.container}`}>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span className={`h-2 w-2 rounded-full ${variant.accent}`} />
          {variant.label}
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          {renderTextBlock(code, undefined, `callout-${calloutVariant}`)}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-slate-950 text-slate-50">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-200 transition hover:border-slate-500"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function MessageList({
  messages,
  streamingContent,
  searchQuery,
  emptyState: emptyStateOverride,
  currentUserId,
  reactionOptions,
  onEditMessage,
  onDeleteMessage,
  onTogglePin,
  onToggleReaction,
  onRetryMessage,
  onFlagMessage,
  onResolveFlag,
  onHideMessage,
  readOnly = false,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null)
  const emptyState = useMemo<EmptyState>(
    () => ({
      title: "Start the conversation with a question or a creative prompt.",
    }),
    []
  )
  const effectiveEmptyState = emptyStateOverride || emptyState

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      )
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, streamingContent])

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0)
  const pinnedMessages = isSearching
    ? []
    : messages.filter((message) => message.pinned)
  const regularMessages = isSearching
    ? messages
    : messages.filter((message) => !message.pinned)
  const emojiPalette =
    reactionOptions.length > 0
      ? reactionOptions
      : ["👍", "❤️", "😂", "🎉", "🤔", "👀", "✨", "🔥"]

  function startEdit(message: Message) {
    setEditingId(message.id)
    setEditingContent(message.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingContent("")
  }

  function saveEdit(messageId: string) {
    if (!editingContent.trim()) return
    onEditMessage(messageId, editingContent.trim())
    cancelEdit()
  }

  function requestDelete(message: Message) {
    setDeleteTarget(message)
  }

  function confirmDelete() {
    if (deleteTarget) {
      onDeleteMessage(deleteTarget.id)
    }
    setDeleteTarget(null)
  }

  function closeDeleteModal() {
    setDeleteTarget(null)
  }

  function renderReactions(message: Message) {
    const reactions = message.reactions ?? {}
    const visibleEmojis = Object.keys(reactions)
    if (visibleEmojis.length === 0 && readOnly) return null

    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {visibleEmojis.map((emoji) => {
          const count = reactions[emoji]?.length ?? 0
          const isActive = reactions[emoji]?.includes(currentUserId)
          return (
            <button
              key={`${message.id}-reaction-${emoji}`}
              type="button"
              onClick={() => {
                if (!readOnly) onToggleReaction(message.id, emoji)
              }}
              disabled={readOnly}
              className={`rounded-full border px-2 py-0.5 text-xs transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {emoji}
              {count > 0 && <span className="ml-1">{count}</span>}
            </button>
          )
        })}
        {!readOnly && (
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setPickerMessageId((prev) =>
                  prev === message.id ? null : message.id
                )
              }
              className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 transition hover:border-slate-300"
            >
              +
            </button>
            {pickerMessageId === message.id && (
              <div className="absolute left-0 top-full z-10 mt-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {emojiPalette.map((emoji) => (
                  <button
                    key={`${message.id}-picker-${emoji}`}
                    type="button"
                    onClick={() => {
                      onToggleReaction(message.id, emoji)
                      setPickerMessageId(null)
                    }}
                    className="rounded-full border border-slate-200 px-2 py-1 text-sm hover:border-slate-300"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  function formatSize(size: number) {
    if (size < 1024) return `${size}B`
    if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`
    return `${(size / (1024 * 1024)).toFixed(1)}MB`
  }

  function renderAttachments(message: Message) {
    if (!message.attachments || message.attachments.length === 0) return null
    return (
      <div className="mt-3 space-y-2">
        {message.attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="rounded-xl border border-slate-200/70 bg-white/90 p-3 text-xs text-slate-600"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">
                {attachment.name}
              </span>
              <span>{formatSize(attachment.size)}</span>
            </div>
            {attachment.type === "image" ? (
              <Image
                src={attachment.url}
                alt={attachment.name}
                width={720}
                height={480}
                sizes="(max-width: 768px) 100vw, 720px"
                unoptimized
                className="mt-2 max-h-48 w-auto rounded-lg border border-slate-200/70"
              />
            ) : (
              <div className="mt-2 space-y-2">
                <embed
                  src={attachment.url}
                  type="application/pdf"
                  className="h-40 w-full rounded-lg border border-slate-200/70"
                />
                {attachment.previewError && (
                  <p className="text-[0.7rem] text-amber-600">
                    {attachment.previewError}
                  </p>
                )}
                {attachment.previewText && (
                  <p className="text-[0.7rem] text-slate-500">
                    {attachment.previewText}...
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  function renderMessage(message: Message) {
    const isUser = message.role === "user"
    const isOwnMessage = isUser && message.senderId === currentUserId
    const isEditing = editingId === message.id
    const blocks = splitMarkdownBlocks(message.content)
    const statusLabel =
      message.status === "pending"
        ? "Sending..."
        : message.status === "error"
        ? "Failed"
        : null

    return (
      <div
        key={message.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div className="group max-w-[82%] space-y-2">
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
              isUser
                ? "bg-slate-900 text-slate-50"
                : "border border-slate-200/70 bg-white/90 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between gap-2 pb-2 text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
              <span>{isUser ? "You" : "Assistant"}</span>
              <div className="flex items-center gap-2 text-[0.65rem] font-medium">
                {message.pinned && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                    Pinned
                  </span>
                )}
                {message.flags && message.flags.length > 0 && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                    Flagged
                  </span>
                )}
                {message.hidden && (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600">
                    Hidden
                  </span>
                )}
                {statusLabel && <span>{statusLabel}</span>}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200/70 bg-white/90 p-3 text-sm text-slate-900"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(message.id)}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {blocks.map((block, blockIndex) =>
                  block.type === "code" ? (
                    <CodeBlock
                      key={`${message.id}-code-${blockIndex}`}
                      code={block.content}
                      language={block.language}
                      calloutVariant={block.calloutVariant}
                    />
                  ) : (
                    <div
                      key={`${message.id}-text-${blockIndex}`}
                      className="space-y-2"
                    >
                      {renderTextBlock(
                        block.content,
                        searchQuery,
                        `${message.id}-text-${blockIndex}`
                        )}
                      </div>
                    )
                  )}
                {renderAttachments(message)}
              </div>
            )}
          </div>

          <div
            className={`flex flex-wrap items-center gap-2 text-xs text-slate-500 ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {!readOnly && (
              <button
                type="button"
                onClick={() => onTogglePin(message.id, !message.pinned)}
                className="rounded-full border border-slate-200 px-2 py-0.5 transition hover:border-slate-300"
              >
                {message.pinned ? "Unpin" : "Pin"}
              </button>
            )}
            {isOwnMessage && !isEditing && message.status !== "pending" && !readOnly && (
              <button
                type="button"
                onClick={() => startEdit(message)}
                className="rounded-full border border-slate-200 px-2 py-0.5 transition hover:border-slate-300"
              >
                Edit
              </button>
            )}
            {isOwnMessage && !readOnly && (
              <button
                type="button"
                onClick={() => requestDelete(message)}
                className="rounded-full border border-slate-200 px-2 py-0.5 transition hover:border-slate-300"
              >
                Delete
              </button>
            )}
            {message.status === "error" && !readOnly && (
              <button
                type="button"
                onClick={() => onRetryMessage(message.id)}
                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700"
              >
                Retry
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onFlagMessage(message.id, "user-flag")}
                className="rounded-full border border-rose-200 px-2 py-0.5 text-rose-600 transition hover:border-rose-300"
              >
                Flag
              </button>
            )}
            {!readOnly && message.flags && message.flags.length > 0 && (
              <button
                type="button"
                onClick={() => onResolveFlag(message.id)}
                className="rounded-full border border-emerald-200 px-2 py-0.5 text-emerald-600 transition hover:border-emerald-300"
              >
                Resolve
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onHideMessage(message.id, !message.hidden)}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600 transition hover:border-slate-300"
              >
                {message.hidden ? "Unhide" : "Hide"}
              </button>
            )}
          </div>

          {renderReactions(message)}
        </div>
      </div>
    )
  }

  return (
    <>
      <ScrollArea
        ref={scrollAreaRef}
        className="h-[420px] w-full rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur"
      >
        <div className="space-y-4">
          {messages.length === 0 && !streamingContent && (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="max-w-xs text-center text-sm text-muted-foreground">
                {(effectiveEmptyState.title ||
                  effectiveEmptyState.description) && (
                  <>
                    <p className="font-medium text-slate-600">
                      {effectiveEmptyState.title}
                    </p>
                    {effectiveEmptyState.description && (
                      <p className="mt-1">{effectiveEmptyState.description}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {pinnedMessages.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Pinned
              </div>
              {pinnedMessages.map(renderMessage)}
            </div>
          )}

          {regularMessages.map(renderMessage)}

          {/* Streaming message */}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[82%] rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm">
                <p className="whitespace-pre-wrap">
                  {streamingContent}
                  <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-current" />
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {deleteTarget && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-900">
              Delete message?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This will remove your message for everyone in the room.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-full bg-rose-600 px-3 py-1 text-sm text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
