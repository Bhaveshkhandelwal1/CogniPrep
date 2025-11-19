"use client"

import dynamic from "next/dynamic"
import { SignIn } from "@clerk/nextjs"
import { useEffect, useState } from "react"

// Dynamically import SignIn only on client side
const DynamicSignIn = dynamic(
  () => Promise.resolve(SignIn),
  { 
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    ),
  }
)

export function ClerkSignIn() {
  const [isClient, setIsClient] = useState(false)
  const [hasClerkProvider, setHasClerkProvider] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Try to access Clerk context - if it exists, ClerkProvider is available
    try {
      // Check if Clerk is available by checking for the publishable key
      const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      setHasClerkProvider(
        !!publishableKey && publishableKey !== "pk_test_placeholder_for_build"
      )
    } catch {
      setHasClerkProvider(false)
    }
  }, [])

  if (!isClient) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!hasClerkProvider) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Sign In Not Available</h1>
          <p className="text-muted-foreground">
            Clerk authentication is not configured. Please set up your Clerk keys.
          </p>
        </div>
      </div>
    )
  }

  return <DynamicSignIn />
}

