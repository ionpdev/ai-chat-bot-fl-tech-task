import { AdminDashboard } from "@/components/AdminDashboard"

export default async function AdminPage() {
  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Read-only overview of rooms, moderation flags, and analytics.
          </p>
        </header>

        <AdminDashboard />
      </div>
    </main>
  )
}
