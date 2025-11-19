import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/next"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Get Arcjet key directly from environment (middleware runs on Edge, env validation might fail)
// Use direct env access to avoid validation errors in middleware
const arcjetKey = process.env.ARCJET_KEY

// Check if Clerk is configured (check at runtime, not module load time)
function isClerkConfigured(): boolean {
  return !!(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
}

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

// Public routes that don't require authentication
const publicRoutes = [
  "/sign-in",
  "/",
  "/api/webhooks",
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  )
}

// Base middleware handler (used when Clerk is not configured)
async function baseMiddleware(req: NextRequest) {
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
    // Log error but don't block the request
    console.error("Middleware error:", error)
    return NextResponse.next()
  }
}

// Main middleware - always use base middleware to avoid Clerk import issues
// Route-level authentication will still work via getCurrentUser() in pages
// This prevents MIDDLEWARE_INVOCATION_FAILED errors when Clerk keys are missing
export default baseMiddleware

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
