"use client"

import { Button } from "@/components/ui/button"
import { SignInButton as ClerkSignInButton } from "@clerk/nextjs"
import { useClerk } from "@clerk/nextjs"
import Link from "next/link"

export function SignInButton({ forceRedirectUrl }: { forceRedirectUrl: string }) {
  const clerk = useClerk()
  
  // If Clerk is not loaded or key is invalid, show a simple link button
  if (!clerk.loaded) {
    return (
      <Button variant="outline" asChild>
        <Link href="/sign-in">Sign In</Link>
      </Button>
    )
  }

  return (
    <ClerkSignInButton forceRedirectUrl={forceRedirectUrl}>
      <Button variant="outline">Sign In</Button>
    </ClerkSignInButton>
  )
}

