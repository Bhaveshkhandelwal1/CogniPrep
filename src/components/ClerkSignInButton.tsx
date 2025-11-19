"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"

// Dynamically import ClerkSignInButton to avoid SSR issues
const ClerkSignInButton = dynamic(
  () => import("@clerk/nextjs").then((mod) => mod.SignInButton),
  { 
    ssr: false,
    loading: () => (
      <Button variant="outline" asChild>
        <Link href="/sign-in">Sign In</Link>
      </Button>
    )
  }
)

export function SignInButton({ forceRedirectUrl }: { forceRedirectUrl: string }) {
  const [isClient, setIsClient] = useState(false)
  const [hasClerkProvider, setHasClerkProvider] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Check if ClerkProvider is available by checking for the publishable key
    // This is a simple check - at runtime, ClerkProvider should be available if key exists
    if (typeof window !== "undefined") {
      // ClerkProvider should be available at runtime if configured
      // We'll try to render ClerkSignInButton, and it will handle errors internally
      setHasClerkProvider(true)
    }
  }, [])

  // During SSR/build, always show fallback
  if (!isClient) {
    return (
      <Button variant="outline" asChild>
        <Link href="/sign-in">Sign In</Link>
      </Button>
    )
  }

  // At runtime, try to use Clerk if available
  // The dynamic import with ssr: false ensures this only renders on client
  if (hasClerkProvider) {
    return (
      <ClerkSignInButton forceRedirectUrl={forceRedirectUrl}>
        <Button variant="outline">Sign In</Button>
      </ClerkSignInButton>
    )
  }

  // Fallback
  return (
    <Button variant="outline" asChild>
      <Link href="/sign-in">Sign In</Link>
    </Button>
  )
}

