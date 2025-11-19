"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"

// Dynamically import ClerkPricingTable to avoid SSR issues
const ClerkPricingTable = dynamic(
  () => import("@clerk/nextjs").then((mod) => mod.PricingTable),
  { 
    ssr: false,
    loading: () => (
      <div className="text-center py-12 text-muted-foreground">
        Loading pricing plans...
      </div>
    )
  }
)

export function PricingTable() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // During SSR/build, show a placeholder
  if (!isClient) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading pricing plans...
      </div>
    )
  }

  // At runtime, use Clerk PricingTable
  return <ClerkPricingTable newSubscriptionRedirectUrl="/app" />
}
