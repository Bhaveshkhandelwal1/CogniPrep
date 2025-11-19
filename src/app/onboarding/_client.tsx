"use client"

import { getUser } from "@/features/users/actions"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

export function OnboardingClient({ userId }: { userId: string }) {
  const router = useRouter()
  const redirectAttempted = useRef(false)

  useEffect(() => {
    let pollCount = 0
    const maxPolls = 120 // 30 seconds max (120 * 250ms)
    
    const intervalId = setInterval(async () => {
      pollCount++
      
      // Stop polling after max attempts
      if (pollCount > maxPolls) {
        clearInterval(intervalId)
        console.error("User creation timeout - user was not created in database")
        return
      }

      const user = await getUser(userId)
      if (user == null) return

      // Prevent multiple redirects
      if (redirectAttempted.current) return
      redirectAttempted.current = true

      clearInterval(intervalId)
      
      // Force a full page reload to /app to bypass Next.js cache
      // This ensures the server-side check in /app layout sees the fresh user data
      // Add a small delay to ensure database write is committed
      setTimeout(() => {
        window.location.href = "/app"
      }, 100)
    }, 250)

    return () => {
      clearInterval(intervalId)
    }
  }, [userId, router])

  return <Loader2Icon className="animate-spin size-24" />
}
