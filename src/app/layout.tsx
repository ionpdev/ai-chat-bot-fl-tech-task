import type { Metadata } from "next"
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"

const displaySans = Space_Grotesk({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const plexMono = IBM_Plex_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "Live AI Room Chats",
  description: "Real-time AI chat with streaming responses and live updates.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${displaySans.variable} ${plexMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
