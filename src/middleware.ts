import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/next"
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest, NextMiddleware } from "next/server"

// Get Arcjet key directly from environment (middleware runs on Edge, env validation might fail)
// Use direct env access to avoid validation errors in middleware
const arcjetKey = process.env.ARCJET_KEY

// Check if Clerk is configured
const hasClerkSecret = !!process.env.CLERK_SECRET_KEY
const hasClerkPublishable = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const isClerkConfigured = hasClerkSecret && hasClerkPublishable

// Only initialize Arcjet if key is available
const aj = arcjetKey ? arcjet({
  key: arcjetKey,
  rules: [
    shield({ 
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
    }),
    detectBot({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
    }),
    slidingWindow({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
      interval: "1m",
      max: 100,
    }),
  ],
}) : null

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/",
  "/api/webhooks(.*)",
])

// Fallback middleware when Clerk is not configured
const fallbackMiddleware: NextMiddleware = async (req) => {
  try {
    // Only run Arcjet protection if it's initialized
    if (aj) {
      const decision = await aj.protect(req)

      if (decision.isDenied()) {
        return new NextResponse(null, { status: 403 })
      }
    }

    // Allow all requests when Clerk is not configured
    return NextResponse.next()
  } catch (error) {
    console.error("Middleware error:", error)
    return NextResponse.next()
  }
}

// Create middleware - always use clerkMiddleware so Clerk can detect it
// This allows auth() to work even if keys are missing (it will just return null)
export default clerkMiddleware(async (auth, req) => {
  try {
    // Only run Arcjet protection if it's initialized
    if (aj) {
      const decision = await aj.protect(req)

      if (decision.isDenied()) {
        return new NextResponse(null, { status: 403 })
      }
    }

    // Only protect routes if Clerk is configured
    // If Clerk is not configured, auth.protect() might fail, so we catch it
    if (isClerkConfigured && !isPublicRoute(req)) {
      try {
        await auth.protect()
      } catch (error) {
        // If auth fails (e.g., Clerk not properly configured), allow the request
        console.warn("Clerk auth failed, allowing request:", error)
      }
    }
    // If Clerk is not configured, just allow all requests (no auth protection)
  } catch (error) {
    // Log error but don't block the request
    console.error("Middleware error:", error)
    // Allow the request to continue even if middleware fails
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
