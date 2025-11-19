import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { redirect } from "next/navigation"
import { ReactNode } from "react"
import { Navbar } from "./_Navbar"

// Mark as dynamic since we use getCurrentUser() which calls auth() and uses headers()
// This makes all /app routes dynamic
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId, user } = await getCurrentUser({ allData: true })

  if (userId == null) return redirect("/")
  if (user == null) return redirect("/onboarding")

  return (
    <>
      <Navbar user={user} />
      {children}
    </>
  )
}
